import { defineBackend } from "@aws-amplify/backend";
import { auth } from "./auth/resource";
import { claims } from "./functions/claims/resource";
import { scanResult } from "./functions/scan-result/resource";
import { integration } from "./functions/integration/resource";
import { RemovalPolicy, Duration, Stack } from "aws-cdk-lib";
import {
  Table,
  AttributeType,
  BillingMode,
  TableEncryption,
} from "aws-cdk-lib/aws-dynamodb";
import {
  Bucket,
  BlockPublicAccess,
  BucketEncryption,
  HttpMethods,
  ObjectOwnership,
} from "aws-cdk-lib/aws-s3";
import {
  HttpApi,
  CorsHttpMethod,
  HttpMethod,
} from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { HttpUserPoolAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { Queue } from "aws-cdk-lib/aws-sqs";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { Role, ServicePrincipal, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { CfnMalwareProtectionPlan } from "aws-cdk-lib/aws-guardduty";
import { Rule } from "aws-cdk-lib/aws-events";
import { LambdaFunction } from "aws-cdk-lib/aws-events-targets";
const backend = defineBackend({ auth, claims, integration, scanResult });
backend.auth.resources.cfnResources.cfnUserPool.adminCreateUserConfig = {
  allowAdminCreateUserOnly: true,
};
backend.auth.resources.cfnResources.cfnUserPool.policies = {
  passwordPolicy: {
    minimumLength: 14,
    requireLowercase: true,
    requireUppercase: true,
    requireNumbers: true,
    requireSymbols: true,
  },
};
const stack = Stack.of(backend.claims.resources.lambda);
const table = new Table(stack, "Claims", {
  partitionKey: { name: "pk", type: AttributeType.STRING },
  sortKey: { name: "sk", type: AttributeType.STRING },
  billingMode: BillingMode.PAY_PER_REQUEST,
  encryption: TableEncryption.AWS_MANAGED,
  pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
  removalPolicy: RemovalPolicy.RETAIN,
});
table.addGlobalSecondaryIndex({
  indexName: "byOwner",
  partitionKey: { name: "ownerKey", type: AttributeType.STRING },
  sortKey: { name: "createdAt", type: AttributeType.STRING },
});
table.addGlobalSecondaryIndex({
  indexName: "byAssignee",
  partitionKey: { name: "assigneeKey", type: AttributeType.STRING },
  sortKey: { name: "createdAt", type: AttributeType.STRING },
});
// Exact browser origin is supplied by the deployer; no wildcard origins in production.
const origin = process.env.PORTAL_ORIGIN || "http://localhost:5173";
const bucket = new Bucket(stack, "Documents", {
  blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
  encryption: BucketEncryption.S3_MANAGED,
  enforceSSL: true,
  versioned: true,
  objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
  removalPolicy: RemovalPolicy.RETAIN,
  cors: [
    {
      allowedOrigins: [origin],
      allowedMethods: [HttpMethods.PUT, HttpMethods.GET],
      allowedHeaders: ["content-type", "x-amz-checksum-sha256"],
      exposedHeaders: ["ETag"],
      maxAge: 300,
    },
  ],
  lifecycleRules: [{ abortIncompleteMultipartUploadAfter: Duration.days(1) }],
});
// GuardDuty scans new versions; events release only the matching object version.
const scanRole = new Role(stack, "MalwareScanRole", {
  assumedBy: new ServicePrincipal(
    "malware-protection-plan.guardduty.amazonaws.com",
  ),
});
const managedRuleArn = `arn:${stack.partition}:events:${stack.region}:${stack.account}:rule/DO-NOT-DELETE-AmazonGuardDutyMalwareProtectionS3*`;
scanRole.addToPolicy(
  new PolicyStatement({
    actions: [
      "events:PutRule",
      "events:DeleteRule",
      "events:PutTargets",
      "events:RemoveTargets",
    ],
    resources: [managedRuleArn],
    conditions: {
      StringLike: {
        "events:ManagedBy": "malware-protection-plan.guardduty.amazonaws.com",
      },
    },
  }),
);
scanRole.addToPolicy(
  new PolicyStatement({
    actions: ["events:DescribeRule", "events:ListTargetsByRule"],
    resources: [managedRuleArn],
  }),
);
scanRole.addToPolicy(
  new PolicyStatement({
    actions: [
      "s3:GetBucketNotification",
      "s3:PutBucketNotification",
      "s3:ListBucket",
    ],
    resources: [bucket.bucketArn],
  }),
);
scanRole.addToPolicy(
  new PolicyStatement({
    actions: [
      "s3:GetObject",
      "s3:GetObjectVersion",
      "s3:GetObjectTagging",
      "s3:GetObjectVersionTagging",
      "s3:PutObjectTagging",
      "s3:PutObjectVersionTagging",
    ],
    resources: [bucket.arnForObjects("*")],
  }),
);
scanRole.addToPolicy(
  new PolicyStatement({
    actions: ["s3:PutObject"],
    resources: [
      bucket.arnForObjects("malware-protection-resource-validation-object"),
    ],
  }),
);
const protection = new CfnMalwareProtectionPlan(stack, "MalwareProtection", {
  role: scanRole.roleArn,
  protectedResource: { s3Bucket: { bucketName: bucket.bucketName } },
  actions: { tagging: { status: "ENABLED" } },
});
protection.node.addDependency(scanRole);
backend.scanResult.addEnvironment("BUCKET_NAME", bucket.bucketName);
const scanDlq = new Queue(stack, "ScanResultDeadLetters", {
  retentionPeriod: Duration.days(14),
});
new Rule(stack, "ScanVerdicts", {
  eventPattern: {
    source: ["aws.guardduty"],
    detailType: ["GuardDuty Malware Protection Object Scan Result"],
    detail: { s3ObjectDetails: { bucketName: [bucket.bucketName] } },
  },
  targets: [
    new LambdaFunction(backend.scanResult.resources.lambda, {
      deadLetterQueue: scanDlq,
      retryAttempts: 10,
      maxEventAge: Duration.hours(24),
    }),
  ],
});
const dlq = new Queue(stack, "IntegrationDeadLetters", {
  retentionPeriod: Duration.days(14),
});
const queue = new Queue(stack, "IntegrationQueue", {
  visibilityTimeout: Duration.seconds(180),
  deadLetterQueue: { queue: dlq, maxReceiveCount: 3 },
});
for (const fn of [backend.claims, backend.integration, backend.scanResult]) {
  fn.addEnvironment("TABLE_NAME", table.tableName);
  table.grantReadWriteData(fn.resources.lambda);
}
backend.claims.addEnvironment("BUCKET_NAME", bucket.bucketName);
backend.claims.addEnvironment("QUEUE_URL", queue.queueUrl);
bucket.grantReadWrite(backend.claims.resources.lambda);
queue.grantSendMessages(backend.claims.resources.lambda);
backend.integration.resources.lambda.addEventSource(
  new SqsEventSource(queue, { batchSize: 5, reportBatchItemFailures: true }),
);
const api = new HttpApi(stack, "ClaimsApi", {
  corsPreflight: {
    allowOrigins: [origin],
    allowHeaders: ["authorization", "content-type", "idempotency-key"],
    allowMethods: [CorsHttpMethod.GET, CorsHttpMethod.POST],
    maxAge: Duration.minutes(10),
  },
});
const authorizer = new HttpUserPoolAuthorizer(
  "Cognito",
  backend.auth.resources.userPool,
  { userPoolClients: [backend.auth.resources.userPoolClient] },
);
api.addRoutes({
  path: "/{proxy+}",
  methods: [HttpMethod.GET, HttpMethod.POST],
  integration: new HttpLambdaIntegration(
    "ClaimsHandler",
    backend.claims.resources.lambda,
  ),
  authorizer,
});
backend.addOutput({
  custom: {
    apiUrl: api.apiEndpoint,
    documentsBucket: bucket.bucketName,
    tableName: table.tableName,
    queueUrl: queue.queueUrl,
    checklistVersion: "gnp-2026-11-04-v1-provisional",
  },
});
