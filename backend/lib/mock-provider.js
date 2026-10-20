import { withTransaction } from './db.js';
import {
  deliverEmailTasks,
  deliverLeadMagnetTasks,
  deliverNicheProfile,
  deliverProspects,
  deliverSeoTasks,
} from './delivery.js';

// A stand-in for the AI and Sift services, used only when PROVIDER_MODE=mock. It delivers through the same
// delivery functions as the real service, so the whole pipeline can be tried without the teammate's code.
// Everything it makes is labelled MOCK, and email addresses use the reserved .invalid domain, which can
// never receive mail.

const BATCH = 100;
const chunks = (list) => Array.from({ length: Math.ceil(list.length / BATCH) }, (_, i) => list.slice(i * BATCH, (i + 1) * BATCH));

export async function mockDeliver(job, payload) {
  const campaignId = job.campaign_id;
  const jobId = job.id;
  const tag = jobId.slice(0, 8);
  const deliver = (fn, items) =>
    Promise.all(chunks(items).map((batch) => withTransaction(null, (db) => fn(db, { jobId, campaignId, items: batch })))).then(
      () => undefined,
    );

  switch (job.kind) {
    case 'NICHE_ANALYSIS':
      await withTransaction(null, (db) =>
        deliverNicheProfile(db, {
          jobId,
          campaignId,
          profile: {
            _mock: true,
            niche: payload.campaign.niche,
            summary: `MOCK niche profile for ${payload.campaign.niche}`,
            pain_points: ['MOCK pain point one', 'MOCK pain point two'],
            messaging_constraints: 'MOCK: no guarantees, no pricing claims',
            approved_platforms: ['Medium', 'LinkedIn'],
          },
        }),
      );
      return;
    case 'PROSPECT_SEARCH':
      await deliver(
        deliverProspects,
        Array.from({ length: payload.count }, (_, i) => ({
          sift_id: `mock-${tag}-${i + 1}`,
          organisation: `MOCK Organisation ${tag}-${i + 1}`,
          contact_name: `MOCK Contact ${i + 1}`,
          email: `contact${i + 1}.${tag}@mock.invalid`,
          website: `https://mock.invalid/${tag}/${i + 1}`,
          industry: payload.campaign.niche,
          location: payload.campaign.location,
          qualification_status: 'QUALIFIED',
          qualification_reason: 'MOCK: generated for testing',
        })),
      );
      return;
    case 'EMAIL_GENERATION':
      await deliver(
        deliverEmailTasks,
        payload.prospects.map((p) => ({
          external_ref: `mock-email-${p.id}`,
          prospect_id: p.id,
          subject: `[MOCK] ${payload.campaign.offer} for ${p.organisation}`,
          body: `MOCK email to ${p.contact_name ?? p.organisation} about ${payload.campaign.offer}.`,
        })),
      );
      return;
    case 'SEO_GENERATION':
      await deliver(
        deliverSeoTasks,
        Array.from({ length: payload.count }, (_, i) => ({
          external_ref: `mock-seo-${tag}-${i + 1}`,
          topic: `MOCK topic ${tag}-${i + 1}`,
          primary_keyword: `mock keyword ${tag}-${i + 1}`,
          secondary_keywords: ['mock one', 'mock two'],
          title: `[MOCK] Article ${i + 1} for ${payload.campaign.niche}`,
          article: `MOCK article body ${i + 1}.`,
          meta_title: `MOCK meta title ${i + 1}`,
          meta_description: `MOCK meta description ${i + 1}`,
          cta: `MOCK: try ${payload.campaign.offer}`,
          platform: 'Medium',
        })),
      );
      return;
    case 'LEAD_MAGNET_GENERATION':
      await deliver(
        deliverLeadMagnetTasks,
        Array.from({ length: payload.count }, (_, i) => ({
          external_ref: `mock-lead-${tag}-${i + 1}`,
          platform: 'LinkedIn',
          author: `MOCK Author ${i + 1}`,
          post_url: `https://mock.invalid/post/${tag}/${i + 1}`,
          post_text: `MOCK post ${i + 1}`,
          relevance_reason: 'MOCK: generated for testing',
          comment: `MOCK comment ${i + 1}`,
        })),
      );
      return;
    default:
      throw new Error(`Unknown job kind ${job.kind}`);
  }
}
