import { describe, expect, it } from 'vitest';

import { mapAgentResult } from '../src/services/complaint-processor.js';
import type { AgentRunResponse } from '../src/services/agent-client.js';

const complaint = {
  category: 'pothole' as const,
  description: 'A pothole is blocking the lane.',
  recipient: {
    department: 'Unassigned',
    email: 'unassigned@example.invalid',
    ward: 'Unassigned',
    municipality: 'Unassigned',
  },
};

const classification = {
  issue_type: 'pothole',
  severity: 4,
  confidence: 0.9,
  visible_details: 'A pothole is visible.',
  safety_risk: true,
};

function run(status: AgentRunResponse['status'], jurisdiction: unknown): AgentRunResponse {
  return {
    run_id: 'run-1',
    status,
    state: {
      classification,
      jurisdiction,
      draft: { subject: 'Pothole', body: 'Please repair this pothole.' },
    },
  };
}

describe('mapAgentResult', () => {
  it('maps an awaiting approval run to API result fields', () => {
    const result = mapAgentResult(
      run('awaiting_approval', {
        municipality: 'Pune',
        ward: 'Citywide',
        department: 'Roads',
        email: 'roads@pune.example',
        confidence: 0.9,
        sources: [],
        needs_user_review: false,
      }),
      complaint,
    );

    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') {
      expect(result.results.recipient.email).toBe('roads@pune.example');
      expect(result.results.classification.issueType).toBe('pothole');
    }
  });

  it('keeps a valid classification and fallback recipient for unresolved jurisdiction', () => {
    const result = mapAgentResult(run('needs_input', 'unresolved'), complaint);

    expect(result.kind).toBe('needs_input');
    if (result.kind === 'needs_input') {
      expect(result.results.recipient.email).toBe('unassigned@example.invalid');
      expect(result.results.draft.body).toContain('pothole');
    }
  });
});
