import type { EventBridgeHandler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import type { Claim } from "../../../shared/domain";
const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
interface ScanDetail {
  scanStatus: string;
  s3ObjectDetails: { bucketName: string; objectKey: string; versionId: string };
  scanResultDetails: { scanResultStatus: string };
}
export const handler: EventBridgeHandler<
  "GuardDuty Malware Protection Object Scan Result",
  ScanDetail,
  void
> = async (event) => {
  if (
    event.source !== "aws.guardduty" ||
    event.detail.s3ObjectDetails.bucketName !== process.env.BUCKET_NAME
  )
    return;
  const { objectKey, versionId } = event.detail.s3ObjectDetails;
  const [tenant, id, docId] = objectKey.split("/");
  if (!tenant || !id || !docId) return;
  const Key = { pk: `TENANT#${tenant}#CLAIM#${id}`, sk: "META" };
  for (let attempt = 0; attempt < 5; attempt++) {
    const item = (
      await db.send(
        new GetCommand({
          TableName: process.env.TABLE_NAME,
          Key,
          ConsistentRead: true,
        }),
      )
    ).Item;
    if (!item) return;
    const c = item as Claim;
    const index = c.documents.findIndex(
      (d) => d.id === docId && d.key === objectKey,
    );
    if (index < 0) return;
    const doc = c.documents[index];
    if (doc.storageVersion && doc.storageVersion !== versionId) return;
    const result = event.detail.scanResultDetails.scanResultStatus;
    const scan =
      event.detail.scanStatus === "COMPLETED" && result === "NO_THREATS_FOUND"
        ? "CLEAN"
        : result === "THREATS_FOUND"
          ? "INFECTED"
          : "PENDING";
    try {
      await db.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Update: {
                TableName: process.env.TABLE_NAME,
                Key,
                UpdateExpression: `SET documents[${index}].#scan=:s, documents[${index}].scannedVersion=:sv, #v=:next`,
                ConditionExpression: "#v=:old",
                ExpressionAttributeNames: { "#scan": "scan", "#v": "version" },
                ExpressionAttributeValues: {
                  ":s": scan,
                  ":sv": versionId,
                  ":next": c.version + 1,
                  ":old": c.version,
                },
              },
            },
            {
              Put: {
                TableName: process.env.TABLE_NAME,
                Item: {
                  pk: Key.pk,
                  sk: `AUDIT#SCAN#${event.id}`,
                  action: "MALWARE_SCAN",
                  documentId: docId,
                  scan,
                  at: event.time,
                  actor: "guardduty",
                },
              },
            },
          ],
        }),
      );
      return;
    } catch (error) {
      if ((error as Error).name !== "TransactionCanceledException") throw error;
    }
  }
  throw new Error("Concurrent updates prevented recording scan verdict");
};
