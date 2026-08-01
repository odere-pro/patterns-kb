/* products.mjs — the ONE place in this repo that holds an external URL.
 *
 * The site is relative-links-only so it works from file:// as well as GitHub Pages (see the
 * root CLAUDE.md). Vendor documentation is the single carve-out: a product named in a
 * capability's mapping table is worth one click, and that click necessarily leaves the site.
 * Keeping every such URL here means `scripts/audit-products.mjs` can gate the lot, and no
 * page ever hand-writes an absolute href.
 *
 * The registry is keyed BY PROVIDER first, and that is load-bearing rather than tidy:
 * "Application Load Balancer" is an AWS product AND the current name of Google's layer-7
 * balancer, and "API Gateway" is a product on both AWS and Google Cloud. A flat name->URL map
 * would send one cloud's reader to the other cloud's docs. The builder knows which column a
 * cell sits in, so it asks for that column's names only.
 *
 * Anti-fabrication, same standard as the mapping cells themselves: an invented docs URL is
 * the same class of lie as an invented product name. Every entry here was fetched and
 * returned 200 — re-check with `node scripts/audit-products.mjs --online`.
 *
 * NAMES ARE BASE PRODUCT NAMES, not the whole cell. A cell reading "SQS FIFO queues" links
 * the "SQS" and leaves the feature words as prose, which is why "SQS" and "Amazon SQS" are
 * both registered: longest-match-first picks whichever the cell actually says.
 */

export const PRODUCTS = {
  aws: {
    "Amazon SQS": "https://docs.aws.amazon.com/sqs/",
    "SQS": "https://docs.aws.amazon.com/sqs/",
    "Amazon SNS": "https://docs.aws.amazon.com/sns/",
    "SNS": "https://docs.aws.amazon.com/sns/",
    "Amazon EventBridge": "https://docs.aws.amazon.com/eventbridge/",
    "Amazon Kinesis Data Streams": "https://docs.aws.amazon.com/kinesis/",
    "Amazon MSK": "https://docs.aws.amazon.com/msk/",
    "Amazon MQ": "https://docs.aws.amazon.com/amazon-mq/",
    "AWS Step Functions": "https://docs.aws.amazon.com/step-functions/",
    "AWS Batch": "https://docs.aws.amazon.com/batch/",
    "AWS Glue": "https://docs.aws.amazon.com/glue/",
    "AWS IAM Identity Center": "https://docs.aws.amazon.com/singlesignon/",
    "AWS IAM": "https://docs.aws.amazon.com/iam/",
    "AWS STS": "https://docs.aws.amazon.com/STS/latest/APIReference/welcome.html",
    "AWS WAF": "https://docs.aws.amazon.com/waf/",
    "Amazon API Gateway": "https://docs.aws.amazon.com/apigateway/",
    "API Gateway": "https://docs.aws.amazon.com/apigateway/",
    "Amazon CloudFront": "https://docs.aws.amazon.com/cloudfront/",
    "Amazon Cognito": "https://docs.aws.amazon.com/cognito/",
    "Amazon EKS": "https://docs.aws.amazon.com/eks/",
    "Amazon ECR": "https://docs.aws.amazon.com/ecr/",
    "Amazon EMR": "https://docs.aws.amazon.com/emr/",
    "Amazon ElastiCache": "https://docs.aws.amazon.com/elasticache/",
    "Amazon Managed Service for Apache Flink": "https://docs.aws.amazon.com/managed-flink/",
    "Amazon Redshift": "https://docs.aws.amazon.com/redshift/",
    "Amazon S3": "https://docs.aws.amazon.com/s3/",
    "S3": "https://docs.aws.amazon.com/s3/",
    "Application Load Balancer": "https://docs.aws.amazon.com/elasticloadbalancing/",
    "ALB": "https://docs.aws.amazon.com/elasticloadbalancing/",
    "Aurora": "https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/CHAP_AuroraOverview.html",
    "AWS CodeDeploy": "https://docs.aws.amazon.com/codedeploy/",
    "CodeDeploy": "https://docs.aws.amazon.com/codedeploy/",
    "DynamoDB": "https://docs.aws.amazon.com/dynamodb/",
    "EC2 Auto Scaling": "https://docs.aws.amazon.com/autoscaling/",
    "Amazon EC2": "https://docs.aws.amazon.com/ec2/",
    "RDS": "https://docs.aws.amazon.com/rds/",
    "Amazon Keyspaces": "https://docs.aws.amazon.com/keyspaces/",
    "AWS CloudTrail": "https://docs.aws.amazon.com/cloudtrail/",
    "AWS Config": "https://docs.aws.amazon.com/config/",
    "AWS Organizations": "https://docs.aws.amazon.com/organizations/",
    /* Registered as the lowercase phrase, not "AWS Organizations service control policies":
     * both cells that say it spell the prefix differently, and the phrase matches inside each. */
    "service control policies": "https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_scps.html",
    "AWS X-Ray": "https://docs.aws.amazon.com/xray/",
    "AWS Distro for OpenTelemetry": "https://aws-otel.github.io/docs/introduction",
  },
  azure: {
    "Azure API Management": "https://learn.microsoft.com/azure/api-management/",
    "API Management": "https://learn.microsoft.com/azure/api-management/",
    "Azure App Service": "https://learn.microsoft.com/azure/app-service/",
    "App Service": "https://learn.microsoft.com/azure/app-service/",
    "Azure Application Gateway": "https://learn.microsoft.com/azure/application-gateway/",
    "Application Gateway": "https://learn.microsoft.com/azure/application-gateway/",
    "Azure Batch": "https://learn.microsoft.com/azure/batch/",
    "Azure Blob Storage": "https://learn.microsoft.com/azure/storage/blobs/",
    "Azure Cache for Redis": "https://learn.microsoft.com/azure/azure-cache-for-redis/",
    "Azure Data Factory": "https://learn.microsoft.com/azure/data-factory/",
    "Azure Databricks": "https://learn.microsoft.com/azure/databricks/",
    "Azure Durable Functions": "https://learn.microsoft.com/azure/azure-functions/durable/durable-functions-overview",
    "Azure Functions": "https://learn.microsoft.com/azure/azure-functions/",
    "Azure Event Grid": "https://learn.microsoft.com/azure/event-grid/",
    "Azure Event Hubs": "https://learn.microsoft.com/azure/event-hubs/",
    "Event Hubs": "https://learn.microsoft.com/azure/event-hubs/",
    "Azure Front Door": "https://learn.microsoft.com/azure/frontdoor/",
    "Front Door": "https://learn.microsoft.com/azure/frontdoor/",
    "Azure Kubernetes Service": "https://learn.microsoft.com/azure/aks/",
    "Azure Queue Storage": "https://learn.microsoft.com/azure/storage/queues/",
    "Azure RBAC": "https://learn.microsoft.com/azure/role-based-access-control/",
    "Azure SQL Database": "https://learn.microsoft.com/azure/azure-sql/database/",
    "Azure Service Bus": "https://learn.microsoft.com/azure/service-bus-messaging/",
    "Service Bus": "https://learn.microsoft.com/azure/service-bus-messaging/",
    "Azure Stream Analytics": "https://learn.microsoft.com/azure/stream-analytics/",
    "Azure Synapse": "https://learn.microsoft.com/azure/synapse-analytics/",
    "Cosmos DB": "https://learn.microsoft.com/azure/cosmos-db/",
    "Logic Apps": "https://learn.microsoft.com/azure/logic-apps/",
    "Microsoft Entra External ID": "https://learn.microsoft.com/entra/external-id/",
    "Microsoft Entra ID": "https://learn.microsoft.com/entra/fundamentals/",
    "Virtual Machine Scale Sets": "https://learn.microsoft.com/azure/virtual-machine-scale-sets/",
    "Azure Virtual Machines": "https://learn.microsoft.com/azure/virtual-machines/",
    "Azure Managed Instance for Apache Cassandra": "https://learn.microsoft.com/azure/managed-instance-apache-cassandra/",
    "Azure Data Lake Storage": "https://learn.microsoft.com/azure/storage/blobs/data-lake-storage-introduction",
    "Azure Policy": "https://learn.microsoft.com/azure/governance/policy/",
    "Azure Web Application Firewall": "https://learn.microsoft.com/azure/web-application-firewall/",
    "Azure activity log": "https://learn.microsoft.com/azure/azure-monitor/platform/activity-log",
    "Azure Monitor Agent": "https://learn.microsoft.com/azure/azure-monitor/agents/azure-monitor-agent-overview",
    "Application Insights": "https://learn.microsoft.com/azure/azure-monitor/app/app-insights-overview",
  },
  google: {
    "API Gateway": "https://cloud.google.com/api-gateway/docs",
    "Apigee": "https://cloud.google.com/apigee/docs",
    "Application Load Balancer": "https://cloud.google.com/load-balancing/docs",
    "Batch": "https://cloud.google.com/batch/docs",
    "BigQuery": "https://cloud.google.com/bigquery/docs",
    "Cloud Armor": "https://cloud.google.com/armor/docs",
    "Cloud CDN": "https://cloud.google.com/cdn/docs",
    "Cloud Data Fusion": "https://cloud.google.com/data-fusion/docs",
    "Cloud Identity": "https://cloud.google.com/identity/docs",
    "Cloud IAM": "https://cloud.google.com/iam/docs",
    "Cloud Run": "https://cloud.google.com/run/docs",
    "Cloud SQL": "https://cloud.google.com/sql/docs",
    "Cloud Storage": "https://cloud.google.com/storage/docs",
    "Cloud Tasks": "https://cloud.google.com/tasks/docs",
    "Dataflow": "https://cloud.google.com/dataflow/docs",
    "Dataproc": "https://cloud.google.com/dataproc/docs",
    "Eventarc": "https://cloud.google.com/eventarc/docs",
    "Firestore": "https://cloud.google.com/firestore/docs",
    "Google Kubernetes Engine": "https://cloud.google.com/kubernetes-engine/docs",
    "Identity Platform": "https://cloud.google.com/identity-platform/docs",
    "Memorystore": "https://cloud.google.com/memorystore/docs",
    "Pub/Sub": "https://cloud.google.com/pubsub/docs",
    "Workflows": "https://cloud.google.com/workflows/docs",
    "Compute Engine": "https://cloud.google.com/compute/docs",
    /* Registered under the CURRENT product names, which are the shorter ones. The cells still
     * say "Cloud Bigtable" and "Cloud Spanner"; the boundary rule matches inside both, so the
     * link survives whichever way a cell is later reworded. */
    "Bigtable": "https://cloud.google.com/bigtable/docs",
    "Spanner": "https://cloud.google.com/spanner/docs",
    "Cloud Audit Logs": "https://cloud.google.com/logging/docs/audit",
    "Cloud Trace": "https://cloud.google.com/trace/docs",
    "Ops Agent": "https://cloud.google.com/monitoring/agent/ops-agent",
    "Organization Policy Service": "https://cloud.google.com/resource-manager/docs/organization-policy/overview",
    "Vertex AI Vector Search": "https://cloud.google.com/vertex-ai/docs/vector-search/overview",
  },
  oss: {
    "Apache Airflow": "https://airflow.apache.org/docs/",
    "Airflow": "https://airflow.apache.org/docs/",
    "Apache Flink": "https://nightlies.apache.org/flink/flink-docs-stable/",
    "Apache Spark": "https://spark.apache.org/docs/latest/",
    "Apache Kafka": "https://kafka.apache.org/documentation/",
    "Kafka": "https://kafka.apache.org/documentation/",
    "Apache Cassandra": "https://cassandra.apache.org/doc/latest/",
    "Argo Rollouts": "https://argo-rollouts.readthedocs.io/en/stable/",
    "Authentik": "https://docs.goauthentik.io/",
    "Ceph": "https://docs.ceph.com/",
    "Debezium": "https://debezium.io/documentation/",
    "Envoy": "https://www.envoyproxy.io/docs",
    "Flagger": "https://fluxcd.io/flagger/",
    "HAProxy": "https://docs.haproxy.org/",
    "Keycloak": "https://www.keycloak.org/documentation",
    "Kong Gateway": "https://docs.konghq.com/gateway/",
    "Kubernetes": "https://kubernetes.io/docs/",
    "Memcached": "https://github.com/memcached/memcached/wiki",
    "MinIO": "https://min.io/docs/minio/linux/index.html",
    "NATS": "https://docs.nats.io/",
    "NGINX": "https://nginx.org/en/docs/",
    "Open Policy Agent": "https://www.openpolicyagent.org/docs",
    "OpenBao": "https://openbao.org/docs/",
    "OpenFGA": "https://openfga.dev/docs",
    "Patroni": "https://patroni.readthedocs.io/en/latest/",
    "PostgreSQL": "https://www.postgresql.org/docs/",
    "RabbitMQ": "https://www.rabbitmq.com/docs",
    "Slurm": "https://slurm.schedmd.com/documentation.html",
    "Temporal": "https://docs.temporal.io/",
    "Valkey": "https://valkey.io/topics/",
    "Varnish": "https://varnish-cache.org/docs/",
    "k3s": "https://docs.k3s.io/",
    "rclone": "https://rclone.org/docs/",
    "Harbor": "https://goharbor.io/docs/",
    "Knative": "https://knative.dev/docs/",
    "CockroachDB": "https://www.cockroachlabs.com/docs/",
    "YugabyteDB": "https://docs.yugabyte.com/",
    "Coraza": "https://coraza.io/docs/",
    "ModSecurity": "https://github.com/owasp-modsecurity/ModSecurity/wiki",
    "OpenTelemetry Collector": "https://opentelemetry.io/docs/collector/",
    "Fluent Bit": "https://docs.fluentbit.io/manual",
    "Vector": "https://vector.dev/docs/",
    "Jaeger": "https://www.jaegertracing.io/docs/",
    "Grafana Tempo": "https://grafana.com/docs/tempo/latest/",
  },
};

/** The four service columns of a mapping table, in the order the tables carry them. */
export const PROVIDER_COLUMNS = ["aws", "azure", "google", "oss"];

const reEscape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* One alternation per provider, longest name first. JS alternation is leftmost-FIRST rather
 * than leftmost-longest, so the sort is what makes "Amazon SQS" win over "SQS" and
 * "Cloud Identity" over "Cloud IAM". The lookarounds keep a name from matching mid-word:
 * without them "Batch" would fire inside "Batching" and "S3" inside "S3xyz". They test for
 * alphanumerics rather than using \b because several names end in a non-word character. */
const matchers = new Map();
function matcherFor(provider) {
  if (!matchers.has(provider)) {
    const names = Object.keys(PRODUCTS[provider] || {}).sort((a, b) => b.length - a.length);
    matchers.set(provider, names.length
      ? new RegExp(`(?<![A-Za-z0-9])(${names.map(reEscape).join("|")})(?![A-Za-z0-9])`, "g")
      : null);
  }
  return matchers.get(provider);
}

/* Regions of a cell that linkify must not touch, matched whole so the scan skips over them:
 * an existing <a> (the internal comparison link a cell may already carry — that link wins for
 * that name, which is what keeps "patterns link in, products link out" from colliding), a
 * <code> identifier, and any lone tag, so a product name can never be injected into an
 * attribute value. Anchors and code are listed before the bare-tag branch so they are
 * consumed with their contents rather than one tag at a time. */
const PROTECTED = /<a\b[^>]*>[\s\S]*?<\/a>|<code\b[^>]*>[\s\S]*?<\/code>|<[^>]+>/gi;

/**
 * Link every registered product name in one mapping cell's inner HTML.
 * @param {string} html  the cell as authored on the capability page
 * @param {string} provider  one of PROVIDER_COLUMNS — decides whose docs a name resolves to
 */
export function linkifyProducts(html, provider) {
  const re = matcherFor(provider);
  if (!re || !html) return html;
  const table = PRODUCTS[provider];
  const link = (text) => text.replace(re, (name) =>
    `<a class="prod" href="${table[name]}" target="_blank" rel="noopener noreferrer">${name}</a>`);

  let out = "", last = 0;
  for (const m of html.matchAll(PROTECTED)) {
    out += link(html.slice(last, m.index)) + m[0];
    last = m.index + m[0].length;
  }
  return out + link(html.slice(last));
}

/** Every entry as {provider, name, url} — what audit-products.mjs iterates. */
export function registryEntries() {
  return PROVIDER_COLUMNS.flatMap((p) =>
    Object.entries(PRODUCTS[p] || {}).map(([name, url]) => ({ provider: p, name, url })));
}
