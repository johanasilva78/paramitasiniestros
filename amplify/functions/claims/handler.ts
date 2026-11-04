import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { randomUUID, createHash } from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  PutCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { z } from "zod";
import {
  claimInput,
  checklistVersion,
  canRead,
  canOperate,
  visibleClaim,
  transition,
  documentsFor,
  statuses,
  type Actor,
  type Claim,
  type Role,
} from "../../../shared/domain";
const db = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const s3 = new S3Client({}),
  sqs = new SQSClient({});
const TableName = process.env.TABLE_NAME!;
const key = (tenant: string, id: string) => ({
  pk: `TENANT#${tenant}#CLAIM#${id}`,
  sk: "META",
});
const roles: Role[] = [
  "insured",
  "employee",
  "hr",
  "analyst",
  "approver",
  "viewer",
  "admin",
  "support",
];
const response = (statusCode: number, data: unknown) => ({
  statusCode,
  headers: {
    "content-type": "application/json",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  },
  body: JSON.stringify(data),
});
async function audit(a: Actor, id: string, action: string) {
  await db.send(
    new PutCommand({
      TableName,
      Item: {
        pk: key(a.tenant, id).pk,
        sk: `AUDIT#${new Date().toISOString()}#${randomUUID()}`,
        actor: a.sub,
        role: a.role,
        action,
        at: new Date().toISOString(),
      },
    }),
  );
}
async function load(a: Actor, id: string) {
  const item = (
    await db.send(
      new GetCommand({
        TableName,
        Key: key(a.tenant, id),
        ConsistentRead: true,
      }),
    )
  ).Item;
  if (!item) throw new Error("NOT_FOUND");
  return item as Claim;
}
async function save(a: Actor, c: Claim, action: string) {
  const old = c.version;
  c.version++;
  c.updatedAt = new Date().toISOString();
  await db.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName,
            Item: {
              ...c,
              ...key(a.tenant, c.id),
              ownerKey: `${a.tenant}#${c.owner}`,
              assigneeKey: c.assignee ? `${a.tenant}#${c.assignee}` : undefined,
            },
            ConditionExpression: "#v=:v",
            ExpressionAttributeNames: { "#v": "version" },
            ExpressionAttributeValues: { ":v": old },
          },
        },
        {
          Put: {
            TableName,
            Item: {
              pk: key(a.tenant, c.id).pk,
              sk: `AUDIT#${c.updatedAt}#${randomUUID()}`,
              actor: a.sub,
              role: a.role,
              action,
              status: c.status,
              reason: action === "TRANSITION" ? c.internalNotes : undefined,
              at: c.updatedAt,
            },
          },
        },
      ],
    }),
  );
  return c;
}
const uploadInput = z.object({
  type: z.string(),
  name: z
    .string()
    .min(1)
    .max(160)
    .regex(/^[^/\\\x00-\x1f]+$/),
  mime: z.enum([
    "application/pdf",
    "image/jpeg",
    "image/png",
    "application/xml",
    "text/xml",
  ]),
  size: z
    .number()
    .int()
    .positive()
    .max(10 * 1024 * 1024),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (
  event,
) => {
  let actorForAudit: Actor | undefined;
  try {
    const jwt = event.requestContext.authorizer.jwt.claims;
    if (!jwt?.sub || !jwt["custom:tenant"])
      return response(401, { error: "Identidad o empresa no configurada" });
    const raw = jwt["cognito:groups"];
    const groups = Array.isArray(raw)
      ? raw
      : String(raw || "")
          .replace(/[\[\]" ]/g, "")
          .split(",");
    // Single effective role avoids ambiguous privilege inheritance.
    const selected = roles.filter((r) => groups.includes(r));
    if (selected.length !== 1)
      return response(403, {
        error: "Configura exactamente un perfil por usuario",
      });
    const a: Actor = {
      sub: String(jwt.sub),
      tenant: String(jwt["custom:tenant"]),
      role: selected[0],
    };
    actorForAudit = a;
    const method = event.requestContext.http.method,
      path = event.rawPath.split("/").filter(Boolean);
    if ((event.body?.length || 0) > 100_000)
      return response(413, {
        error: "La solicitud excede el límite permitido",
      });
    const body = event.body
      ? JSON.parse(
          event.isBase64Encoded
            ? Buffer.from(event.body, "base64").toString()
            : event.body,
        )
      : {};
    if (path[0] === "me") return response(200, a);
    if (path[0] === "catalog")
      return response(200, {
        checklistVersion,
        approved: false,
        enabledModalities: [
          "reimbursement",
          "surgery",
          "medication",
          "deductible",
        ],
      });
    if (path[0] !== "claims")
      return response(404, { error: "Ruta desconocida" });
    if (path.length === 1 && method === "GET") {
      if (!["insured", "employee", "analyst", "approver"].includes(a.role))
        return response(200, {
          items: [],
          notice:
            "Este perfil no dispone de acceso clínico. Usa el tablero administrativo.",
        });
      const index = ["analyst", "approver"].includes(a.role)
        ? "byAssignee"
        : "byOwner";
      const attr = index === "byOwner" ? "ownerKey" : "assigneeKey";
      const cursor = event.queryStringParameters?.cursor;
      let start;
      if (cursor) {
        start = JSON.parse(Buffer.from(cursor, "base64url").toString());
        if (start[attr] !== `${a.tenant}#${a.sub}`)
          throw new Error("FORBIDDEN");
      }
      const result = await db.send(
        new QueryCommand({
          TableName,
          IndexName: index,
          KeyConditionExpression: "#k=:k",
          ExpressionAttributeNames: { "#k": attr },
          ExpressionAttributeValues: { ":k": `${a.tenant}#${a.sub}` },
          Limit: 50,
          ScanIndexForward: false,
          ExclusiveStartKey: start,
        }),
      );
      return response(200, {
        items: (result.Items || [])
          .filter((c) => canRead(a, c as Claim))
          .map((c) => visibleClaim(a, c as Claim)),
        cursor: result.LastEvaluatedKey
          ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString(
              "base64url",
            )
          : undefined,
      });
    }
    if (path.length === 1 && method === "POST") {
      if (!["insured", "employee"].includes(a.role))
        throw new Error("FORBIDDEN");
      const input = claimInput.parse(body);
      const idem = z.string().uuid().parse(event.headers["idempotency-key"]);
      const id = createHash("sha256")
        .update(`${a.tenant}:${a.sub}:${idem}`)
        .digest("hex")
        .slice(0, 24);
      const inputHash = createHash("sha256")
        .update(JSON.stringify(input))
        .digest("hex");
      const now = new Date().toISOString();
      const c: Claim = {
        ...input,
        id,
        tenant: a.tenant,
        owner: a.sub,
        status: "Recibido",
        createdAt: now,
        updatedAt: now,
        version: 1,
        checklistVersion,
        documents: [],
        events: [
          {
            at: now,
            actor: a.sub,
            status: "Recibido",
            message: "Solicitud recibida en el portal",
          },
        ],
        integration: "NOT_REQUESTED",
      };
      try {
        await db.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                Put: {
                  TableName,
                  Item: {
                    ...c,
                    ...key(a.tenant, id),
                    ownerKey: `${a.tenant}#${a.sub}`,
                    inputHash,
                  },
                  ConditionExpression: "attribute_not_exists(pk)",
                },
              },
              {
                Put: {
                  TableName,
                  Item: {
                    pk: key(a.tenant, id).pk,
                    sk: `AUDIT#${now}`,
                    actor: a.sub,
                    action: "CREATE",
                    at: now,
                  },
                },
              },
            ],
          }),
        );
      } catch (err) {
        if ((err as Error).name !== "TransactionCanceledException") throw err;
        const previous = (
          await db.send(
            new GetCommand({
              TableName,
              Key: key(a.tenant, id),
              ConsistentRead: true,
            }),
          )
        ).Item;
        if (!previous || previous.inputHash !== inputHash)
          return response(409, {
            error: "La clave de envío corresponde a otros datos",
          });
        return response(200, visibleClaim(a, previous as Claim));
      }
      return response(201, visibleClaim(a, c));
    }
    const id = z
      .string()
      .regex(/^[a-f0-9]{24}$/)
      .parse(path[1]);
    let c = await load(a, id);
    // Admin assignment is metadata-only, never grants implicit medical access.
    if (path[2] === "assign" && method === "POST") {
      if (a.role !== "admin") throw new Error("FORBIDDEN");
      const assignee = z.string().uuid().parse(body.assignee);
      const user = (
        await db.send(
          new GetCommand({
            TableName,
            Key: { pk: `TENANT#${a.tenant}`, sk: `STAFF#${assignee}` },
          }),
        )
      ).Item;
      if (!user || !["analyst", "approver"].includes(user.role))
        throw new Error(
          "El responsable no está autorizado en esta organización",
        );
      c.assignee = assignee;
      await save(a, c, "ASSIGN");
      return response(200, { id, assignee });
    }
    if (!canRead(a, c)) throw new Error("FORBIDDEN");
    if (path.length === 2 && method === "GET") {
      await audit(a, id, "READ");
      return response(200, visibleClaim(a, c));
    }
    if (path[2] === "transition" && method === "POST") {
      const data = z
        .object({
          status: z.enum(statuses),
          reason: z.string().min(5).max(1000),
          version: z.number().int(),
        })
        .parse(body);
      if (data.version !== c.version)
        return response(409, {
          error: "El expediente cambió; actualiza la pantalla",
        });
      c = transition(a, c, data.status, data.reason);
      c.events.push({
        at: new Date().toISOString(),
        actor: a.sub,
        status: data.status,
        message: "Estado actualizado por Paramita",
      });
      c.internalNotes = data.reason;
      await save(a, c, "TRANSITION");
      return response(200, visibleClaim(a, c));
    }
    if (path[2] === "gnp" && method === "POST") {
      if (!canOperate(a, c)) throw new Error("FORBIDDEN");
      const data = z
        .object({
          folio: z.string().min(3).max(100),
          channel: z.string().min(3).max(100),
          evidenceId: z.string().uuid(),
          date: z.string().datetime(),
        })
        .parse(body);
      const doc = c.documents.find(
        (d) =>
          d.id === data.evidenceId &&
          d.type === "GNP-RECEIPT" &&
          d.state === "UPLOADED" &&
          d.scan === "CLEAN",
      );
      if (!doc)
        throw new Error("Adjunta el acuse GNP antes de registrar el folio");
      c.gnp = { ...data, actor: a.sub };
      await save(a, c, "GNP_RECEIPT");
      return response(200, visibleClaim(a, c));
    }
    if (path[2] === "resolution" && method === "POST") {
      if (!canOperate(a, c)) throw new Error("FORBIDDEN");
      const data = z
        .object({
          result: z.enum([
            "Respuesta favorable",
            "Respuesta no favorable",
            "Otro resultado informado",
          ]),
          detail: z.string().min(5).max(1000),
          evidenceId: z.string().uuid(),
          date: z.string().datetime(),
        })
        .parse(body);
      if (
        !c.documents.some(
          (d) =>
            d.id === data.evidenceId &&
            d.type === "GNP-RESULT" &&
            d.state === "UPLOADED" &&
            d.scan === "CLEAN",
        )
      )
        throw new Error("Se requiere resolución externa adjunta y analizada");
      c.resolution = { ...data, actor: a.sub };
      await save(a, c, "GNP_RESOLUTION");
      return response(200, visibleClaim(a, c));
    }
    if (path[2] === "uploads" && method === "POST") {
      if (!(a.sub === c.owner || canOperate(a, c)) || c.status === "Finalizado")
        throw new Error("FORBIDDEN");
      if (c.documents.length >= 100)
        throw new Error("Límite provisional de 100 versiones por expediente");
      const file = uploadInput.parse(body);
      const row = documentsFor(c.modality).find((r) => r.id === file.type);
      if (
        ["GNP-RECEIPT", "GNP-RESULT"].includes(file.type)
          ? !canOperate(a, c)
          : !row || ["X", "—"].includes(row.mark)
      )
        throw new Error("Documento no aplicable");
      const ext = file.name.split(".").pop()?.toLowerCase();
      const valid: Record<string, string[]> = {
        "application/pdf": ["pdf"],
        "image/jpeg": ["jpg", "jpeg"],
        "image/png": ["png"],
        "application/xml": ["xml"],
        "text/xml": ["xml"],
      };
      if (!ext || !valid[file.mime].includes(ext))
        throw new Error("Extensión y tipo de archivo incompatibles");
      if (ext === "xml" && file.type !== "GNP-18")
        throw new Error("XML reservado a facturas");
      const docId = randomUUID();
      const storageKey = `${a.tenant}/${id}/${docId}/${file.name}`;
      const document = {
        ...file,
        id: docId,
        key: storageKey,
        version: 1 + c.documents.filter((d) => d.type === file.type).length,
        state: "PENDING" as const,
        scan: "PENDING" as const,
      };
      c.documents.push(document);
      await save(a, c, "UPLOAD_REQUEST");
      const checksum = Buffer.from(file.sha256, "hex").toString("base64");
      const url = await getSignedUrl(
        s3,
        new PutObjectCommand({
          Bucket: process.env.BUCKET_NAME,
          Key: storageKey,
          ContentType: file.mime,
          ChecksumSHA256: checksum,
          Metadata: { documentId: docId },
        }),
        { expiresIn: 300 },
      );
      return response(200, { document, url, checksum });
    }
    if (path[2] === "documents" && path[3]) {
      const document = c.documents.find((d) => d.id === path[3]);
      if (!document) throw new Error("NOT_FOUND");
      if (path[4] === "review" && method === "POST") {
        if (!canOperate(a, c)) throw new Error("FORBIDDEN");
        const data = z
          .object({
            status: z.enum(["ACCEPTED", "OBSERVED"]),
            reason: z.string().min(5).max(1000),
          })
          .parse(body);
        if (document.state !== "UPLOADED" || document.scan !== "CLEAN")
          throw new Error(
            "El archivo debe completar su carga y análisis de seguridad",
          );
        document.reviewStatus = data.status;
        document.reviewReason = data.reason;
        if (data.status === "OBSERVED") c.status = "Pendiente de documentos";
        c.events.push({
          at: new Date().toISOString(),
          actor: a.sub,
          status: c.status,
          message:
            data.status === "OBSERVED"
              ? `Documento ${document.type}: ${data.reason}`
              : `Documento ${document.type} revisado`,
        });
        await save(a, c, "DOCUMENT_REVIEW");
        return response(200, visibleClaim(a, c));
      }
      if (path[4] === "complete" && method === "POST") {
        if (document.state === "UPLOADED")
          return response(200, visibleClaim(a, c));
        if (!(a.sub === c.owner || canOperate(a, c)))
          throw new Error("FORBIDDEN");
        const head = await s3.send(
          new HeadObjectCommand({
            Bucket: process.env.BUCKET_NAME,
            Key: document.key,
            ChecksumMode: "ENABLED",
          }),
        );
        if (
          head.ContentLength !== document.size ||
          head.ChecksumSHA256 !==
            Buffer.from(document.sha256, "hex").toString("base64")
        )
          throw new Error("Archivo incompleto o hash diferente");
        const sample = await s3.send(
          new GetObjectCommand({
            Bucket: process.env.BUCKET_NAME,
            Key: document.key,
            VersionId: head.VersionId,
            Range: "bytes=0-511",
          }),
        );
        const bytes = await sample.Body?.transformToByteArray();
        if (!bytes)
          throw new Error("No se pudo verificar el formato del archivo");
        const signature = Buffer.from(bytes);
        const text = signature
          .toString("utf8")
          .replace(/^\uFEFF/, "")
          .trimStart();
        const validSignature =
          document.mime === "application/pdf"
            ? text.startsWith("%PDF-")
            : document.mime === "image/png"
              ? signature
                  .subarray(0, 8)
                  .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
              : document.mime === "image/jpeg"
                ? signature[0] === 255 &&
                  signature[1] === 216 &&
                  signature[2] === 255
                : text.startsWith("<?xml") || text.startsWith("<cfdi:");
        if (!validSignature)
          throw new Error(
            "El contenido del archivo no corresponde al formato declarado",
          );
        document.state = "UPLOADED";
        document.storageVersion = head.VersionId;
        if (document.scannedVersion !== head.VersionId)
          document.scan = "PENDING";
        await save(a, c, "UPLOAD_COMPLETE");
        return response(200, visibleClaim(a, c));
      }
      if (method === "GET") {
        // Fail closed until an approved malware scanner supplies a clean verdict.
        if (document.state !== "UPLOADED" || document.scan !== "CLEAN")
          return response(423, {
            error:
              "Documento en cuarentena, pendiente de análisis de seguridad",
          });
        await audit(a, id, "DOWNLOAD");
        return response(200, {
          url: await getSignedUrl(
            s3,
            new GetObjectCommand({
              Bucket: process.env.BUCKET_NAME,
              Key: document.key,
              VersionId: document.storageVersion,
              ResponseContentDisposition: "attachment",
            }),
            { expiresIn: 60 },
          ),
        });
      }
    }
    if (path[2] === "integration" && method === "GET") {
      if (!canOperate(a, c)) throw new Error("FORBIDDEN");
      const jobs = await db.send(
        new QueryCommand({
          TableName,
          KeyConditionExpression: "pk=:p AND begins_with(sk,:s)",
          ExpressionAttributeValues: {
            ":p": key(a.tenant, id).pk,
            ":s": "JOB#",
          },
        }),
      );
      return response(200, { items: jobs.Items });
    }
    if (path[2] === "integration" && method === "POST") {
      if (!canOperate(a, c)) throw new Error("FORBIDDEN");
      const jobId = z.string().uuid().parse(event.headers["idempotency-key"]);
      const job = {
        pk: key(a.tenant, id).pk,
        sk: `JOB#${jobId}`,
        state: "PENDING",
        createdAt: new Date().toISOString(),
        actor: a.sub,
      };
      try {
        await db.send(
          new PutCommand({
            TableName,
            Item: job,
            ConditionExpression: "attribute_not_exists(pk)",
          }),
        );
      } catch (err) {
        if ((err as Error).name !== "ConditionalCheckFailedException")
          throw err;
      }
      await sqs.send(
        new SendMessageCommand({
          QueueUrl: process.env.QUEUE_URL,
          MessageBody: JSON.stringify({ tenant: a.tenant, id, jobId }),
        }),
      );
      await audit(a, id, "SICAS_REQUEST");
      return response(202, { jobId, state: "PENDING" });
    }
    return response(404, { error: "Ruta desconocida" });
  } catch (error) {
    const err = error as Error;
    const codes: Record<string, number> = {
      FORBIDDEN: 403,
      NOT_FOUND: 404,
      ConditionalCheckFailedException: 409,
      TransactionCanceledException: 409,
    };
    if (error instanceof z.ZodError)
      return response(400, {
        error: error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      });
    const code = codes[err.message] || codes[err.name];
    if (code === 403 && actorForAudit) {
      try {
        await audit(actorForAudit, "ACCESS", "ACCESS_DENIED");
      } catch {
        console.error(
          JSON.stringify({
            action: "DENIAL_AUDIT_FAILURE",
            requestId: event.requestContext.requestId,
          }),
        );
      }
    }
    if (code)
      return response(code, {
        error:
          code === 403
            ? "Acceso denegado"
            : code === 404
              ? "Expediente no encontrado"
              : "Conflicto de versión, actualiza y reintenta",
      });
    if (err.name === "Error") return response(400, { error: err.message });
    console.error(
      JSON.stringify({
        action: "API_FAILURE",
        requestId: event.requestContext.requestId,
        type: err.name,
      }),
    );
    return response(500, {
      error: "No fue posible completar la operación",
      requestId: event.requestContext.requestId,
    });
  }
};
