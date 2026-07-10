import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';

// Configure OTLP HTTP trace exporter pointing to Tempo
const traceExporter = new OTLPTraceExporter({
  url: 'http://tempo:4318/v1/traces',
});

// Configure Prometheus metrics exporter on port 9464
const metricReader = new PrometheusExporter({
  port: 9464,
  startServer: true,
});

// Initialize the OpenTelemetry SDK
const sdk = new NodeSDK({
  traceExporter,
  metricReader,
  instrumentations: [getNodeAutoInstrumentations()],
  serviceName: 'homelab-backend',
});

sdk.start();

console.log('OpenTelemetry SDK started. Traces -> http://tempo:4318/v1/traces, Metrics -> http://app_backend:9464/metrics');

// Handle graceful shutdown
process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => console.log('Tracing terminated'))
    .catch((err) => console.log('Error terminating tracing', err))
    .finally(() => process.exit(0));
});
