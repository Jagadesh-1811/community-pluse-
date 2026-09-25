# Decision

The agent evaluates incoming field reports using an AI-driven Urgency Engine to calculate an automated urgency score. This score, combined with the location of active mission sectors and available volunteers tracked via GPS, forms the reasoning behind the automated dispatch alerts and resource allocation decisions. These factors ensure rapid response times.

# Inputs

The primary data source includes real-time need submissions and status updates from reporters via the FieldOps Portal. Additional data used includes the live GPS telemetry of volunteers and communication logs from the Strategic Command Hub. The inputs are constantly refreshed to maintain real-time accuracy.

# Limitation

One known issue is that the Urgency Engine may require continuous fine-tuning to accurately score ambiguous or highly complex field reports. A current limitation is that the system relies on external APIs like Twilio for WhatsApp notifications, which introduces a dependency constraint and potential delays if the third-party service experiences downtime. We are working on fallback mechanisms to handle this constraint.
