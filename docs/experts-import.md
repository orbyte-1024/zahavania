# Importing real experts

The directory only lists people who agreed to appear in it (AGENTS.md §2.7). Fictional demo profiles stay in the
database but are hidden from suggestions unless `EXPERTS_INCLUDE_FICTIONAL=true`.

## 1. Fill the file

Start from `data/experts-template.csv` (comma or semicolon separated, UTF-8; an Excel "CSV UTF-8" export works).
One row per person. Lists use `|`, for example `health|education`.

| Column | Required | Allowed values |
|---|---|---|
| `full_name` | yes | 2 to 120 characters |
| `title`, `organization` | no | free text |
| `org_type` | no | `public_institution`, `ngo`, `academic`, `private`, `association`, `independent`, `media` |
| `domains` | yes | one or more of the ids in `lib/constants/domains.ts` (`health`, `economy_finance`, ...) |
| `languages` | yes | one or more of `mg`, `fr`, `en` |
| `regions` | no | ids from `lib/constants/regions.ts` (`analamanga`, `atsinanana`, ...); empty means national |
| `bio` | no | 300 characters at most |
| `contact_email`, `contact_phone` | no | only what the person agreed to share |
| `consent_status` | yes | `granted` (agreed), `public_info` (public professional contact), `pending`, `revoked` |
| `consent_date` | if `granted` | `YYYY-MM-DD` |
| `info_source` | yes | where the information comes from (interview, official website, ...) |
| `last_verified_at` | yes | `YYYY-MM-DD`, the day the details were last checked |

Only `granted` and `public_info` appear in suggestions. Set `revoked` to remove someone: the row stays, the person
is no longer shown.

## 2. Check, then import

```bash
npm run experts:import -- experts.csv          # dry run: checks every row, writes nothing
npm run experts:import -- experts.csv --apply  # writes to Supabase (needs SUPABASE_SERVICE_ROLE_KEY)
```

A single invalid row stops the whole import; each problem is listed by line and column. The script never prints
contact details. Running it again updates the same people instead of duplicating them: a person is identified by
name and organization.

Do not commit the filled file: it holds personal data.
