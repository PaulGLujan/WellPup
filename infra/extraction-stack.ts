import path from "path"
import { ArnFormat, Duration, Stack, type StackProps } from "aws-cdk-lib"
import * as iam from "aws-cdk-lib/aws-iam"
import * as lambda from "aws-cdk-lib/aws-lambda"
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs"
import * as logs from "aws-cdk-lib/aws-logs"
import * as s3 from "aws-cdk-lib/aws-s3"
import { LambdaDestination } from "aws-cdk-lib/aws-s3-notifications"
import type { Construct } from "constructs"

// Name of the Secrets Manager secret holding the Anthropic API key. The secret
// is created by hand, outside this stack, so the key never passes through CDK
// or CloudFormation (see docs/extraction-pipeline.md).
const anthropicSecretName = "well-pup/anthropic-api-key"

// The first slice of GH-15: uploads to the bucket trigger a Lambda that
// extracts vaccines with Claude and logs the result.
export class ExtractionStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    // Vet records contain personal information, so the bucket is private and
    // HTTPS-only. It's kept if the stack is deleted (the CDK default for
    // buckets), so records aren't lost by accident.
    const uploads = new s3.Bucket(this, "Uploads", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
    })

    const extractFunction = new NodejsFunction(this, "ExtractFunction", {
      entry: path.join(import.meta.dirname, "lambda/extract-handler.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_24_X,
      architecture: lambda.Architecture.ARM_64,
      // Claude takes up to ~11s on a long record, and the Anthropic SDK may
      // retry twice, so the 3s default is far too short.
      timeout: Duration.minutes(2),
      memorySize: 512,
      environment: {
        ANTHROPIC_API_KEY_SECRET_ID: anthropicSecretName,
      },
      logGroup: new logs.LogGroup(this, "ExtractFunctionLogs", {
        retention: logs.RetentionDays.ONE_MONTH,
      }),
    })

    // Least privilege: read objects from this bucket and read this one
    // secret. Nothing else (the role also gets the standard permission to
    // write its own CloudWatch logs).
    extractFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetObject"],
        resources: [uploads.arnForObjects("*")],
      })
    )
    extractFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["secretsmanager:GetSecretValue"],
        // Secrets Manager appends a random 6-character suffix to secret ARNs.
        resources: [
          this.formatArn({
            service: "secretsmanager",
            resource: "secret",
            resourceName: `${anthropicSecretName}-??????`,
            arnFormat: ArnFormat.COLON_RESOURCE_NAME,
          }),
        ],
      })
    )

    uploads.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new LambdaDestination(extractFunction)
    )
  }
}
