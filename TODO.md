# TODO

## Known bugs — Step 3 (outreach), found in testing

1. **Persona filter is too loose.** A Customer Success Manager got through as the decision-maker at Orbital Witness. The keyword overlap in `personaMatch` (`src/app/api/outreach/route.ts`) matches roles outside the buyer personas.
2. **Emails cite facts that aren't in the trigger or source.** RCFP's draft cites a FOIL guide even though its trigger signal was "None found". Drafts must only use facts from the company's trigger signal and source.
3. **Drafts include stats with no source**, e.g. "FOIL backlogs over a year". Remove any claim that isn't backed by the source.
4. **Step 2 missed darrow.ai's domain.** Domain extraction in `src/app/api/companies/route.ts` returned null, so Hunter was skipped.
5. **Sample contacts should use a persona that fits the company.** Right now the sample title rotates through the ICP buyer titles regardless of the company.
6. **Flag or skip companies outside New York.** Step 2 doesn't check location yet.
