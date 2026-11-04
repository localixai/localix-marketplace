import type { MiniAppContext } from '@localixai/mini-app-sdk/backend'
import { applicationInputSchema, companyInputSchema, patchFor } from '../shared/model'
import { countOf, describeApplication, describeForAgent } from '../shared/report'
import { companyByName, removeCompany, type Applications, type Companies } from './cascade'

/**
 * The agent's tools. The agent does the understanding (it reads the email, the job post, the
 * message) and calls these with structured input; the tools validate, store and answer with what
 * changed and where things stand, so the agent can tell the person in one sentence.
 *
 * Rules every tool here keeps:
 * - A write is `executionMode: 'sequential'`, `mutates: true`, effect `host` (the app's own data).
 *   A read may run in parallel.
 * - `isError: true` only for a call that did nothing because the input was wrong or the id unknown.
 */
export function createTools(ctx: MiniAppContext, companies: Companies, applications: Applications) {
  const { z } = ctx
  const write = {
    executionMode: 'sequential',
    mutates: true,
    classify: () => ({ effect: 'host' as const }),
    permissionPaths: () => [],
  } as const
  const read = { executionMode: 'parallel', mutates: false, permissionPaths: () => [] } as const
  const report = async () =>
    describeForAgent(await companies.list(), await applications.list(), new Date())
  const noApplication = {
    content: 'No application has that id. Read example_tracker_report for the ids.',
    isError: true,
  }

  // What the agent may send for an application: the shared schema, without the two fields the app
  // keeps itself (the company id, the history). The shared schema stays the one source of limits.
  const fields = applicationInputSchema.omit({ companyId: true, history: true })

  return [
    ctx.defineTool({
      ...write,
      name: 'example_tracker_add_application',
      label: 'Add an application',
      activeVerb: 'Adding',
      description:
        'Add one application. Name the company as the person did: it is created when it is new. Answers with the whole search.',
      inputSchema: fields.extend({
        company: companyInputSchema.shape.name.describe('The company, by name.'),
        role: fields.shape.role.describe('The job title, as advertised.'),
        status: fields.shape.status.describe('Where it stands now; wishlist when left out.'),
        salary: fields.shape.salary.describe('Yearly pay in US dollars, if known.'),
        appliedOn: fields.shape.appliedOn.describe('YYYY-MM-DD, the day it was sent.'),
      }),
      async execute(_toolCallId, { company: name, ...input }) {
        const company = await companyByName(companies, name)
        const application = await applications.add({ ...input, companyId: company.id })
        return { content: `Added "${application.role}" at ${company.name}.\n${await report()}` }
      },
    }),
    ctx.defineTool({
      ...write,
      name: 'example_tracker_update_application',
      label: 'Change an application',
      activeVerb: 'Changing',
      description:
        'Change one application by its id: its status, role, pay, day sent or note. Fields left out stay as they are; a new status is added to its timeline.',
      inputSchema: fields.partial().extend({ id: z.string().min(1) }),
      async execute(_toolCallId, { id, ...change }) {
        const current = await applications.get(id)
        if (!current) return noApplication
        // The same rule the screen applies: a move to a new status adds a timeline entry.
        await applications.update(id, patchFor(current, change, new Date()))
        return { content: `Changed "${current.role}".\n${await report()}` }
      },
    }),
    ctx.defineTool({
      ...write,
      name: 'example_tracker_remove_company',
      label: 'Remove a company',
      activeVerb: 'Removing',
      description:
        'Remove a company by its id AND every application made to it. Only for a company the person asked to remove.',
      inputSchema: z.object({ id: z.string().min(1).describe('The company id, from the report.') }),
      async execute(_toolCallId, { id }) {
        const gone = await removeCompany(companies, applications, id)
        if (!gone) {
          return { content: 'No company has that id. Read example_tracker_report.', isError: true }
        }
        const also = gone.removed ? ` and ${countOf(gone.removed, 'application')}` : ''
        return { content: `Removed ${gone.company.name}${also}.\n${await report()}` }
      },
    }),
    ctx.defineTool({
      ...read,
      name: 'example_tracker_find',
      label: 'Find applications',
      activeVerb: 'Searching',
      description:
        'Find applications by meaning ("the remote design ones", "that startup in Berlin"). Empty while the embedding model is not ready: then read the report instead.',
      inputSchema: z.object({ query: z.string().min(1).describe('What to look for.') }),
      async execute(_toolCallId, { query }) {
        // Meaning lives in two places: an application's role and note, and a company's name and
        // note. A company that matches brings its applications along.
        const byCompany = (await companies.search(query, { limit: 5 })).map((company) => company.id)
        const direct = await applications.search(query, { limit: 10 })
        const all = await applications.list()
        const found = new Map(direct.map((application) => [application.id, application]))
        for (const application of all) {
          if (byCompany.includes(application.companyId)) found.set(application.id, application)
        }
        if (!found.size) return { content: 'Nothing matches by meaning (or search is not ready).' }
        const known = await companies.list()
        return {
          content: [...found.values()].map((each) => describeApplication(each, known)).join('\n'),
        }
      },
    }),
    ctx.defineTool({
      ...read,
      name: 'example_tracker_report',
      label: 'Report the search',
      activeVerb: 'Reading the search',
      description:
        'The whole job search: counts per status, what has waited too long for an answer, and every application with its id.',
      inputSchema: z.object({}),
      async execute() {
        return { content: await report() }
      },
    }),
  ]
}
