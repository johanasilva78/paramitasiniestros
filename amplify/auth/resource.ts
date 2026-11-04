import { defineAuth } from "@aws-amplify/backend";
export const auth = defineAuth({
  loginWith: { email: true },
  groups: [
    "insured",
    "employee",
    "hr",
    "analyst",
    "approver",
    "viewer",
    "admin",
    "support",
  ],
  userAttributes: {
    "custom:tenant": {
      dataType: "String",
      mutable: false,
      minLen: 1,
      maxLen: 100,
    },
  },
  multifactor: { mode: "REQUIRED", totp: true },
});
