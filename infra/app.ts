import { App } from "aws-cdk-lib"

import { ExtractionStack } from "./extraction-stack"

// CDK entry point. Run CDK commands from the repo root with `pnpm cdk <cmd>`,
// for example `pnpm cdk diff`.
const app = new App()

new ExtractionStack(app, "WellPupExtraction", {
  // Deploy to the account and region of the current AWS CLI credentials.
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
})
