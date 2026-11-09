import { z } from 'zod';
import pino from 'pino';

import { ComplaintModel, type ComplaintDocument } from '../models/complaint.js';
import { persistAiResults, type AiResults } from '../routes/internal.js';
import { AgentClient, agentClient, type AgentRunResponse } from './agent-client.js';

const logger = pino();

const classificationSchema = z.object({
  issue_type: z.enum(['pothole', 'streetlight', 'garbage', 'drainage', 'other', 'not_an_issue']),
  severity: z.number().int().min(1).max(5),
  confidence: z.number().min(0).max(1),
  visible_details: z.string().min(1).max(2000),
  safety_risk: z.boolean(),
});
const jurisdictionSchema = z.object({
  municipality: z.string().min(1),
  ward: z.string().min(1),
  department: z.string().min(1),
  email: z.string().email().nullable(),
  confidence: z.number().min(0).max(1),
  sources: z.array(z.string()),
  needs_user_review: z.boolean(),
  verification_status: z.string().optional(),
});
const draftSchema = z.object({
  subject: z.string().min(1).max(500),
  body: z.string().min(1).max(20000),
});

export type ComplaintProcessingMapping =
  | { kind: 'ready'; results: AiResults }
  | { kind: 'needs_input'; results: AiResults; error: string }
  | { kind: 'error'; error: string };

export function mapAgentResult(
  run: AgentRunResponse,
  complaint: Pick<ComplaintDocument, 'recipient' | 'description' | 'category'>,
): ComplaintProcessingMapping {
  const classification = classificationSchema.safeParse(run.state.classification);
  if (!classification.success) {
    return { kind: 'error', error: 'Agent returned no valid classification' };
  }

  const draft = draftSchema.safeParse(run.state.draft);
  const jurisdiction = jurisdictionSchema.safeParse(run.state.jurisdiction);
  const fallbackDraft = draft.success
    ? draft.data
    : {
        subject: `Civic issue report: ${classification.data.issue_type}`,
        body: [
          'Dear Sir or Madam,',
          '',
          `I am writing to report the following civic issue: ${complaint.description}`,
          '',
          'Please review this report and advise on the next steps.',
          '',
          'Yours faithfully,',
          'CivicFix reporter',
        ].join('\n'),
      };
  const mappedClassification = {
    issueType: classification.data.issue_type,
    severity: classification.data.severity,
    confidence: classification.data.confidence,
    visibleDetails: classification.data.visible_details,
    safetyRisk: classification.data.safety_risk,
  };

  if (classification.data.issue_type === 'not_an_issue' || classification.data.confidence < 0.4) {
    return {
      kind: 'error',
      error: 'The report could not be confidently classified as a civic issue',
    };
  }

  if (
    run.status === 'awaiting_approval' &&
    jurisdiction.success &&
    !jurisdiction.data.needs_user_review &&
    jurisdiction.data.email
  ) {
    return {
      kind: 'ready',
      results: {
        classification: mappedClassification,
        recipient: {
          department: jurisdiction.data.department,
          email: jurisdiction.data.email,
          ward: jurisdiction.data.ward,
          municipality: jurisdiction.data.municipality,
        },
        draft: fallbackDraft,
      },
    };
  }

  if (jurisdiction.success && jurisdiction.data.needs_user_review && jurisdiction.data.email) {
    return {
      kind: 'needs_input',
      error: 'Please confirm the recipient before sending this report',
      results: {
        classification: mappedClassification,
        recipient: {
          department: jurisdiction.data.department,
          email: jurisdiction.data.email,
          ward: jurisdiction.data.ward,
          municipality: jurisdiction.data.municipality,
          verificationStatus: 'unverified',
          sourceUrls: jurisdiction.data.sources,
        },
        draft: fallbackDraft,
      },
    };
  }

  if (run.status === 'needs_input') {
    return {
      kind: 'needs_input',
      error: 'Please confirm the recipient before sending this report',
      results: {
        classification: mappedClassification,
        recipient: complaint.recipient,
        draft: fallbackDraft,
      },
    };
  }

  return { kind: 'error', error: 'Agent did not produce a usable complaint draft' };
}

export async function processComplaint(
  id: string,
  client: AgentClient = agentClient,
): Promise<void> {
  const complaint = await ComplaintModel.findOneAndUpdate(
    { _id: id, status: 'draft', processingState: { $nin: ['processing', 'completed'] } },
    { $set: { processingState: 'processing', processingError: undefined } },
    { new: true },
  );
  if (!complaint) return;

  try {
    if (!complaint.photoUrl) {
      await markNeedsInput(id, 'A photo is required to process this report');
      return;
    }
    const runId = await client.startRun({
      photoUrl: complaint.photoUrl,
      lat: complaint.location.coordinates[1],
      lng: complaint.location.coordinates[0],
      description: complaint.description,
      reportDate: complaint.createdAt,
    });
    const run = await client.getRun(runId);
    const mapping = mapAgentResult(run, complaint);
    if (mapping.kind === 'error') {
      await markProcessingError(id, 'needs_input', mapping.error);
      return;
    }
    await persistAiResults(id, mapping.results);
    await ComplaintModel.findByIdAndUpdate(id, {
      $set: { processingState: mapping.kind === 'needs_input' ? 'needs_input' : 'completed' },
    });
  } catch (error) {
    logger.error(
      { err: error, cause: error instanceof Error ? error.cause : undefined, complaintId: id },
      'Agent processing failed',
    );
    await markProcessingError(
      id,
      'failed',
      error instanceof Error ? error.message : 'Agent processing failed',
    );
  }
}

async function markNeedsInput(id: string, error: string): Promise<void> {
  await markProcessingError(id, 'needs_input', error);
}

async function markProcessingError(
  id: string,
  processingState: 'needs_input' | 'failed',
  processingError: string,
): Promise<void> {
  await ComplaintModel.findByIdAndUpdate(id, {
    $set: { processingState, processingError },
  });
}
