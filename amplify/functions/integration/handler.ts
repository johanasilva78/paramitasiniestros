import type { SQSHandler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
// Deliberately no invented SICAS endpoint. Replace with an approved adapter and per-file receipts.
export const handler: SQSHandler = async (event) => {
  const batchItemFailures: { itemIdentifier: string }[] = [];
  for (const message of event.Records) {
    try {
      const { tenant, id, jobId } = JSON.parse(message.body);
      await db.send(
        new UpdateCommand({
          TableName: process.env.TABLE_NAME,
          Key: { pk: `TENANT#${tenant}#CLAIM#${id}`, sk: `JOB#${jobId}` },
          UpdateExpression: "SET #s=:s, reason=:r, updatedAt=:t",
          ExpressionAttributeNames: { "#s": "state" },
          ExpressionAttributeValues: {
            ":s": "BLOCKED",
            ":r": "SICAS_CONTRACT_NOT_CONFIGURED",
            ":t": new Date().toISOString(),
          },
          ConditionExpression: "attribute_exists(pk)",
        }),
      );
    } catch {
      batchItemFailures.push({ itemIdentifier: message.messageId });
    }
  }
  return { batchItemFailures };
};
