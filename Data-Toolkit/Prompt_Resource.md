# HubSpot CRM — Copy-Paste Prompt Resource

_Captured 2026-09-14 from the live portal. Companion: `HubSpot_Prompt_Property_Map.xlsx`, `hubspot_crm_schema.json`, `prompt_property_map.json`._

## 0. The one rule that fixes the QVault case

Product questions resolve to the **property** `prod___product_name_new_` (label *PROD - Product name(new)*, description *"Please only use this property from now on"*), never to the deal name.

```sql
SELECT COUNT(*) FROM DEAL WHERE prod___product_name_new_ = 'QVault TPM IOT'   -- 32 (live)
SELECT COUNT(*) FROM DEAL WHERE prod___product_name_new_ = 'QVault TPM'       -- 82 (live)
-- Breeze free-text on the deal name returned 2.
```

## 1. Derivation rules (intent → property)

- **R1 ENUM-VALUE MATCH** — If the user's phrase equals or contains an enumeration option VALUE or LABEL of a property, that property wins. 'QVault TPM IoT' is an option of prod___product_name_new_ → filter that property with the exact value. Highest confidence.  
  _e.g._ `prod___product_name_new_ = 'QVault TPM IOT'`
- **R2 LABEL MATCH** — Match the phrase to the business LABEL (incl. prefixes 'PROD -', 'OPP CUST -', 'INFO -', 'DATE -'), not the internal name. 'Sales region' → INFO - Sales Region → sales_region.  
  _e.g._ `sales_region`
- **R3 GOVERNANCE PRECEDENCE** — Prefer the governed property: label/description says '(new)' or 'only use this from now on'. Demote '(USE ONLY IF EXCEPTION)', '(DO NOT USE)', '(IGNORE)', 'TEST', 'to_delete', 'Test Property'. product_name and solution_family__new_ are never the default answer.  
  _e.g._ `prod___product_name_new_ > product_name > solution_family__new_`
- **R4 YEAR-BY-LABEL** — For any (metric, year) phrase — pipeline / cumulative pipeline / weighted / volume / weighted volume / services value / ASP — resolve through the LABEL. Several internal names were recycled (weighted_2021_calculation is 'Weighted 2027 (k$)'; asp_in_usd_q2_2022_calculation is 'ARR ($K/Y)'). Use the Year Resolver sheet.  
  _e.g._ `Weighted 2027 (k$) → weighted_2021_calculation`
- **R5 TYPE PREFERENCE** — enumeration > bool > number > free-text string. For money aggregation always use amount_in_home_currency / hs_projected_amount_in_home_currency; never SUM(amount) across currencies. Display amount together with deal_currency_code.  
  _e.g._ `SUM(amount_in_home_currency)`
- **R6 STATE SHORTCUTS** — won / lost / open / closed → hs_is_closed_won / hs_is_closed_lost / hs_is_closed (booleans, pipeline-independent). Only use dealstage IDs when the user names a specific stage AND pipeline (IDs are pipeline-specific; 'Design Win' has 6 different IDs).  
  _e.g._ `hs_is_closed = false`
- **R7 NAME-LIKE FALLBACK** — dealname LIKE '%x%' is a LAST RESORT, only when no enum option matches, and the answer must be flagged approximate. Never use it for product/category questions — it under-counts (2 vs 32 for QVault TPM IoT).  
  _e.g._ `dealname LIKE '%Qvault%'  ← wrong for product counts`
- **R8 ASSOCIATION** — 'company / account / contact of the deal' → cross-object OBJECT.property in SELECT/WHERE (COMPANY.name, CONTACT.email). Existence checks → associations.OBJECT IS NOT NULL (WHERE only). Max 2 associated objects per query.  
  _e.g._ `SELECT dealname, COMPANY.name FROM DEAL`
- **R9 SELF-REFERENCE** — 'my / I / me / mine' → hubspot_owner_id = <resolved owner id> (resolve via user-details). Without it the query returns the whole account.  
  _e.g._ `hubspot_owner_id = '29462792'`
- **R10 TIME WINDOW DEFAULTS** — 'this year' = 2026-01-01..2026-12-31; 'this quarter' = 2026-07-01..2026-09-30; 'last quarter' = 2026-04-01..2026-06-30; 'last 90 days' = since 2026-06-16. Dates use BETWEEN with 'YYYY-MM-DD' strings, never timestamps.  
  _e.g._ `closedate BETWEEN '2026-01-01' AND '2026-12-31'`
- **R11 AMBIGUITY** — If two governed properties both match (e.g. 'TPM' hits product_hierarchy=TPM, product_line=TPM and prod___product_name_new_ in {QVault TPM, QVault TPM IOT}), pick the most specific level the user named (SKU > line > family) and state the alternates.  
  _e.g._ `TPM → product_line unless a SKU was named`

## 2. Prompt map — paste the prompt, get the property

| # | Intent | Property | Rule | Copy-paste prompt | HubSQL |
|---|---|---|---|---|---|
| P01 | Count / list deals for a specific product SKU (e.g. QVault TPM IoT, INES, VIC408, QS7001) | `prod___product_name_new_ (PROD - Product name(new))` | R1 enum-value match + R3 governance | Count the deals whose property prod___product_name_new_ (PROD - Product name(new)) equals 'QVault TPM IOT'. Use the property, not the deal name. Also give me the count for 'QVault TPM' separately. | `SELECT COUNT(*) FROM DEAL WHERE prod___product_name_new_ = 'QVault TPM IOT'` |
| P02 | Deals by product family / hierarchy (SCR, VIC, TPM, PKI, ASIC, CISCO, MS600x) | `product_hierarchy` | R1 + R11 (family level named) | Group open deals by product_hierarchy with count and SUM(amount_in_home_currency). | `SELECT product_hierarchy, COUNT(*), SUM(amount_in_home_currency) FROM DEAL WHERE hs_is_closed = false GROUP BY product_hierarchy` |
| P03 | Deals by product line (ASIC / Quantum Shield / PKI / TPM / Legacy) | `product_line` | R1/R2 | Weighted open pipeline by product_line using hs_projected_amount_in_home_currency. | `SELECT product_line, SUM(hs_projected_amount_in_home_currency) FROM DEAL WHERE hs_is_closed = false GROUP BY product_line` |
| P04 | Service deals (NRE, PKI service, digital signature, FTK, pre-study, satellite service, quantum service) | `service_name` | R1 | Break down deals by service_name with count and SUM(amount_in_home_currency). | `SELECT service_name, COUNT(*), SUM(amount_in_home_currency) FROM DEAL GROUP BY service_name` |
| P05 | Is TPM / QVault / QS7001 IP involved? | `tpm_qvault___qs7001___ip__` | R2 | Count deals where tpm_qvault___qs7001___ip__ = 'Yes'. | `SELECT COUNT(*) FROM DEAL WHERE tpm_qvault___qs7001___ip__ = 'Yes'` |
| P06 | Deals per pipeline / business unit | `pipeline` | R1 (pipeline labels are enum labels; filter by ID) | Open deals per pipeline (count + SUM(amount_in_home_currency)). Map pipeline IDs to labels: 12096408 SealSQ Hardware, 13772279 SealSQ Services, 40296576 Wisekey Services + PKI, 875072356 Wise.Sat, 705868909 SEALCOIN, 766126206 Icalps_hardware, 934982230 Quantum & AI. | `SELECT pipeline, COUNT(*), SUM(amount_in_home_currency) FROM DEAL WHERE hs_is_closed = false GROUP BY pipeline` |
| P07 | Deals in a named stage (Identified / Qualified / Design In / Design Win / Closed Won / Lost / Dead / On-Hold / Negociating / PO Sent) | `dealstage (pipeline-specific IDs)` | R1 + R6 | Count open deals per dealstage and translate the stage IDs to '<stage> (<pipeline>)' labels. If I name one stage without a pipeline, include all pipelines' IDs for that stage. | `SELECT dealstage, COUNT(*) FROM DEAL WHERE hs_is_closed = false GROUP BY dealstage` |
| P08 | Open / active deals | `hs_is_closed = false` | R6 | Count and total (amount_in_home_currency) of deals where hs_is_closed = false. | `SELECT COUNT(*), SUM(amount_in_home_currency) FROM DEAL WHERE hs_is_closed = false` |
| P09 | Won deals / bookings / revenue won | `hs_is_closed_won = true` | R6 | Total won revenue in 2026: SUM(amount_in_home_currency) where hs_is_closed_won = true and closedate in 2026. | `SELECT SUM(amount_in_home_currency) FROM DEAL WHERE hs_is_closed_won = true AND closedate BETWEEN '2026-01-01' AND '2026-12-31'` |
| P10 | Lost / dead deals and why | `hs_is_closed_lost = true → stratification_of_lost_deals` | R6 + R1 | For deals with hs_is_closed_lost = true, group by stratification_of_lost_deals with count and SUM(amount_in_home_currency). | `SELECT stratification_of_lost_deals, COUNT(*), SUM(amount_in_home_currency) FROM DEAL WHERE hs_is_closed_lost = true GROUP BY stratification_of_lost_deals` |
| P11 | Pipeline value / total revenue / how much | `amount_in_home_currency` | R5 | Total open pipeline as SUM(amount_in_home_currency) where hs_is_closed = false. | `SELECT SUM(amount_in_home_currency) FROM DEAL WHERE hs_is_closed = false` |
| P12 | Weighted / probability-adjusted pipeline | `hs_projected_amount_in_home_currency` | R5 | Weighted open pipeline = SUM(hs_projected_amount_in_home_currency) where hs_is_closed = false. | `SELECT SUM(hs_projected_amount_in_home_currency) FROM DEAL WHERE hs_is_closed = false` |
| P13 | Year-indexed metric: Pipeline / Cumulative pipeline / Weighted / Volume / Weighted volume / Services value / ASP for a year | `→ Year Resolver sheet (label-driven)` | R4 | Sum the property whose LABEL is exactly 'Weighted 2027 (k$)' (internal name weighted_2021_calculation) over open deals. Do not pick a property by its internal name year. | `SELECT SUM(weighted_2021_calculation) FROM DEAL WHERE hs_is_closed = false   -- 'Weighted 2027 (k$)'` |
| P14 | Commit / forecast category | `hs_manual_forecast_category` | R1 | Open pipeline by hs_manual_forecast_category (OMIT = Not forecasted, COMMIT, CLOSED). | `SELECT hs_manual_forecast_category, SUM(amount_in_home_currency) FROM DEAL WHERE hs_is_closed = false GROUP BY hs_manual_forecast_category` |
| P15 | Revenue state: BIBA vs Forecast vs Pipeline | `revenue_state` | R1 | Total amount_in_home_currency by revenue_state. | `SELECT revenue_state, SUM(amount_in_home_currency) FROM DEAL GROUP BY revenue_state` |
| P16 | Deals by owner / rep / salesperson; 'my deals' | `hubspot_owner_id` | R9 | Open deals per hubspot_owner_id with SUM(amount_in_home_currency); resolve owner IDs to names. | `SELECT hubspot_owner_id, COUNT(*), SUM(amount_in_home_currency) FROM DEAL WHERE hs_is_closed = false GROUP BY hubspot_owner_id` |
| P17 | Deals by sales team | `hubspot_team_id` | R1 | Open pipeline by hubspot_team_id. | `SELECT hubspot_team_id, SUM(amount_in_home_currency) FROM DEAL WHERE hs_is_closed = false GROUP BY hubspot_team_id` |
| P18 | Deals by region | `sales_region` | R1 | Open deals by sales_region. | `SELECT sales_region, COUNT(*), SUM(amount_in_home_currency) FROM DEAL WHERE hs_is_closed = false GROUP BY sales_region` |
| P19 | Channel: distributor vs direct vs rep vs web | `opp_cust___channel_var__new_` | R1 + R3 | Deals by opp_cust___channel_var__new_. | `SELECT opp_cust___channel_var__new_, COUNT(*) FROM DEAL GROUP BY opp_cust___channel_var__new_` |
| P20 | Final customer / end customer / sold-to | `final_customer (end) / sold_to (buyer)` | R2 | Deals where final_customer contains 'Bosch', showing sold_to and the associated COMPANY.name. | `SELECT dealname, sold_to, final_customer, COMPANY.name FROM DEAL WHERE final_customer LIKE '%Bosch%'` |
| P21 | New vs existing customer | `dealtype` | R1 | Deals by dealtype (newbusiness / existingbusiness / existingbusinessre). | `SELECT dealtype, COUNT(*) FROM DEAL GROUP BY dealtype` |
| P22 | Entity split: IC'Alps vs SEALSQ; Wisekey vs Seal | `icalps__sealsq / wisekey___seal` | R1 | Total amount_in_home_currency by icalps__sealsq. | `SELECT icalps__sealsq, SUM(amount_in_home_currency) FROM DEAL GROUP BY icalps__sealsq` |
| P23 | Requirement flags: PQC / FIPS / military / VaultiTrust provisioning / competitor TPM | `pqc_required / fips_required / military_application / vaultitrust_ / using_tpm_from_competition` | R2 (label match; enum values differ: YES/NO vs Yes/No vs true/false) | Count deals where pqc_required = 'YES'; separately fips_required = 'Yes'; military_application = 'Yes'; vaultitrust_ = 'true'. | `SELECT COUNT(*) FROM DEAL WHERE pqc_required = 'YES'` |
| P24 | Milestone dates: identified / qualified / design-in / design-win / closed won / mass production | `identified_date, qualified_date, design_in_date, design_win_date, closed_won_date, closed_lost_date, closed_dead_date, mass_production_date, expected_production_date, expected_decision_date` | R2 (labels 'DATE - n. …') | Deals with design_win_date in 2026 (hardware design wins). | `SELECT dealname, design_win_date FROM DEAL WHERE design_win_date BETWEEN '2026-01-01' AND '2026-12-31'` |
| P25 | Closing when / close date / expected close | `closedate` | R2 + R10 | Open deals with closedate in Q4 2026. | `SELECT dealname, amount_in_home_currency FROM DEAL WHERE hs_is_closed = false AND closedate BETWEEN '2026-10-01' AND '2026-12-31'` |
| P26 | Deal creation trend | `createdate` | R2 | Deals created per month in 2026. | `SELECT DATE_TRUNC(createdate, 'MONTH'), COUNT(*) FROM DEAL WHERE createdate BETWEEN '2026-01-01' AND '2026-12-31' GROUP BY DATE_TRUNC(createdate, 'MONTH')` |
| P27 | Inactive / dormant / no recent activity | `notes_last_updated` | R2 | Open deals with notes_last_updated older than 90 days. | `SELECT dealname, hubspot_owner_id, notes_last_updated FROM DEAL WHERE hs_is_closed = false AND notes_last_updated < '2026-06-16'` |
| P28 | Stalled / aging in stage | `hs_is_stalled / hs_v2_date_entered_current_stage` | R2 | Open deals where hs_is_stalled = true, with date entered current stage. | `SELECT dealname, dealstage, hs_v2_date_entered_current_stage FROM DEAL WHERE hs_is_stalled = true` |
| P29 | Next steps / next activity | `hs_next_step / notes_next_activity_date` | R2 | Open deals with hs_next_step and notes_next_activity_date. | `SELECT dealname, hs_next_step, notes_next_activity_date FROM DEAL WHERE hs_is_closed = false` |
| P30 | Priority deals | `hs_priority` | R1 | Open deals with hs_priority = 'high'. | `SELECT dealname, amount_in_home_currency FROM DEAL WHERE hs_priority = 'high' AND hs_is_closed = false` |
| P31 | Quote status | `quote_status` | R1 | Deals by quote_status. | `SELECT quote_status, COUNT(*) FROM DEAL GROUP BY quote_status` |
| P32 | Sales cycle / days to close / velocity | `days_to_close` | R2 | Average and median days_to_close for won deals by pipeline. | `SELECT pipeline, AVG(days_to_close), MEDIAN(days_to_close) FROM DEAL WHERE hs_is_closed_won = true GROUP BY pipeline` |
| P33 | Deal with its company / account | `COMPANY.name (cross-object)` | R8 | Open deals with their associated COMPANY.name. | `SELECT dealname, COMPANY.name, amount_in_home_currency FROM DEAL WHERE hs_is_closed = false` |
| P34 | Deals for a given company | `COMPANY.name in WHERE` | R8 | Deals whose associated COMPANY.name contains 'Alcom'. | `SELECT dealname, dealstage, amount_in_home_currency FROM DEAL WHERE COMPANY.name LIKE '%Alcom%'` |
| P35 | Deals with no company / no contact | `associations.COMPANY IS NULL / num_associated_contacts = 0` | R8 | Open deals with no associated company. | `SELECT dealname FROM DEAL WHERE hs_is_closed = false AND associations.COMPANY IS NULL` |
| P36 | Deals with no product assigned (data quality) | `prod___product_name_new_ IS NULL` | R1 + data quality (822 deals today) | Open deals with prod___product_name_new_ IS NULL, grouped by owner. | `SELECT hubspot_owner_id, COUNT(*) FROM DEAL WHERE prod___product_name_new_ IS NULL AND hs_is_closed = false GROUP BY hubspot_owner_id` |
| P37 | Company type / status / source | `icalps_companytype / icalps_companystatus / icalps_compsource` | R1 | Companies by icalps_companytype and icalps_companystatus. | `SELECT icalps_companytype, icalps_companystatus, COUNT(*) FROM COMPANY GROUP BY icalps_companytype, icalps_companystatus` |
| P38 | Company industry / segment | `industry (HubSpot) / icalps_industry_drill_down (ICALPS) / comp_sector / market_segment` | R1 / R2 | Companies by icalps_industry_drill_down; also by industry. | `SELECT icalps_industry_drill_down, COUNT(*) FROM COMPANY GROUP BY icalps_industry_drill_down` |
| P39 | Company size / country | `icalps_comp_numemployees / country` | R2 | Customer companies by country. | `SELECT country, COUNT(*) FROM COMPANY WHERE icalps_companytype = 'Customer' GROUP BY country` |
| P40 | Contact status / lifecycle / marketing | `icalps_contactstatus / lifecyclestage / hs_marketable_status / hs_lead_status` | R1 | Contacts by lifecyclestage. | `SELECT lifecyclestage, COUNT(*) FROM CONTACT GROUP BY lifecyclestage` |
| P41 | Contact job title / language / email validity | `jobtitle / hs_language / email_valid` | R2 | Contacts with jobtitle containing 'CTO' and email_valid = 'true'. | `SELECT firstname, lastname, email FROM CONTACT WHERE jobtitle LIKE '%CTO%' AND email_valid = 'true'` |
| P42 | Ticket status / priority / category | `hs_pipeline_stage / hs_ticket_priority / hs_ticket_category` | R1 | Tickets by hs_pipeline_stage and hs_ticket_priority. | `SELECT hs_pipeline_stage, hs_ticket_priority, COUNT(*) FROM TICKET GROUP BY hs_pipeline_stage, hs_ticket_priority` |
| P43 | Activities: calls / meetings / tasks / notes volume and outcomes | `hs_call_disposition / hs_meeting_outcome / hs_task_status + hs_task_missed_due_date / hs_note_body` | R2 (ontology mapping) | Calls this month by hs_call_disposition. | `SELECT hs_call_disposition, COUNT(*) FROM CALL WHERE hs_timestamp BETWEEN '2026-09-01' AND '2026-09-30' GROUP BY hs_call_disposition` |

## 3. Year-indexed metrics — resolve by LABEL (recycled fields!)

| Metric | Year | Internal name | Label | Drift |
|---|---|---|---|---|
| ASP (Hardware) | 2021 | `asp_2021` | ASP 2021 (Hardware only) |  |
| ASP (Hardware) | 2022 | `asp_2022` | ASP 2022 (Hardware only) |  |
| ASP (Hardware) | 2023 | `asp_2023` | ASP 2023 (Hardware only) |  |
| ASP (Hardware) | 2024 | `asp_2024` | ASP 2024 (Hardware only) |  |
| ASP (Hardware) | 2025 | `asp_2025` | ASP 2025 (Hardware only) |  |
| ASP (Hardware) | 2026 | `asp_2026` | ASP 2026 (Hardware only) |  |
| ASP (Hardware) | 2027 | `asp_2027` | ASP 2027 (Hardware Only) |  |
| ASP (Hardware) | 2028 | `asp_in_usd_q2_2021` | ASP 2028 (Hardware Only) | RECYCLED: internal name says 2021, label says 2028 → resolve by label |
| ASP (Hardware) | 2029 | `asp_2029__hardware_only_` | ASP 2029 (Hardware Only) |  |
| Cumulative Pipeline (k$) | 2022 | `calculation___cumulative_pipeline_2022` | Cumulative Pipeline 2022 (k$) |  |
| Cumulative Pipeline (k$) | 2023 | `calculation___cumulative_pipeline_2023` | Cumulative Pipeline 2023 (k$) |  |
| Cumulative Pipeline (k$) | 2024 | `calculation___cumulative_pipeline_2024` | Cumulative Pipeline 2024 (k$) |  |
| Cumulative Pipeline (k$) | 2025 | `calculation___cumulative_pipeline_2025` | Cumulative Pipeline 2025 (k$) |  |
| Cumulative Pipeline (k$) | 2026 | `forecasted_revenue__k_____april_2022_calculation` | Cumulative pipeline 2026 (k$) | RECYCLED: internal name says 2022, label says 2026 → resolve by label |
| Cumulative Pipeline (k$) | 2027 | `calculation___cumulative_pipeline_2026` | Cumulative Pipeline 2027 (k$) | RECYCLED: internal name says 2026, label says 2027 → resolve by label |
| Cumulative Pipeline (k$) | 2028 | `asp_in_usd_q4_2021_calculation` | Cumulative Pipeline 2028 (k$) | RECYCLED: internal name says 2021, label says 2028 → resolve by label |
| Cumulative Pipeline (k$) | 2029 | `cumulative_pipeline_2029_k_adj` | Cumulative Pipeline 2029(k$) |  |
| Pipeline (k$) | 2021 | `calculation___pipeline_2021__k__` | Pipeline 2021 (k$) |  |
| Pipeline (k$) | 2022 | `calculation___pipeline_2022__k__` | Pipeline 2022 (k$) |  |
| Pipeline (k$) | 2023 | `calculation___pipeline_2023__k__` | Pipeline 2023 (k$) |  |
| Pipeline (k$) | 2024 | `calculation___pipeline_2024__k__` | Pipeline 2024 (k$) |  |
| Pipeline (k$) | 2025 | `calculation___pipeline_2025__k__` | Pipeline 2025 (k$) |  |
| Pipeline (k$) | 2026 | `calculation___pipeline_2026__k__` | Pipeline 2026 (k$) |  |
| Pipeline (k$) | 2027 | `calculation___cumulative_weighted_2026` | Pipeline 2027 (k$) | RECYCLED: internal name says 2026, label says 2027 → resolve by label |
| Pipeline (k$) | 2028 | `asp_in_usd_q3_2021_calculation` | Pipeline 2028 (k$) | RECYCLED: internal name says 2021, label says 2028 → resolve by label |
| Pipeline (k$) | 2029 | `pipeline_2029__k__` | Pipeline 2029 (k$) |  |
| Pipeline (k$) [BI variant] | 2027 | `num_deal_date_identified_` | Pipeline 2027[BI] | RECYCLED: internal name has no year → resolve by label |
| PipelineYYYY (legacy flag, untyped) | 2021 | `pipeline2021` | Pipeline2021 |  |
| PipelineYYYY (legacy flag, untyped) | 2022 | `pipeline2022` | Pipeline2022 |  |
| PipelineYYYY (legacy flag, untyped) | 2023 | `pipeline2023` | Pipeline2023 |  |
| PipelineYYYY (legacy flag, untyped) | 2024 | `pipeline2024` | Pipeline2024 |  |
| PipelineYYYY (legacy flag, untyped) | 2025 | `pipeline2025` | Pipeline2025 |  |
| PipelineYYYY (legacy flag, untyped) | 2026 | `pipeline2026` | Pipeline2026 |  |
| Services value (k$) | 2021 | `services_value_2021` | Services Value (k$) 2021 |  |
| Services value (k$) | 2022 | `services_value_2022` | Services Value (k$) 2022 |  |
| Services value (k$) | 2023 | `services_value_2023` | Services Value (k$) 2023 |  |
| Services value (k$) | 2024 | `services_value_2024` | Services Value (k$) 2024 |  |
| Services value (k$) | 2025 | `services_value_2025` | Services Value (k$) 2025 |  |
| Services value (k$) | 2026 | `services_value_2026` | Services Value (k$) 2026 |  |
| Services value (k$) | 2027 | `service_value_2027__k__` | Services value (k$) 2027 |  |
| Services value (k$) | 2028 | `asp_in_usd_q1_2023` | Services value (k$) 2028 | RECYCLED: internal name says 2023, label says 2028 → resolve by label |
| Services value (k$) | 2029 | `service_value__k___2029` | Services value (k$) 2029 |  |
| Volume (ku) Hardware | 2021 | `volume_2021` | Volume 2021 (ku) (Hardware only) |  |
| Volume (ku) Hardware | 2022 | `volume_2022` | Volume 2022 (ku) (Hardware only) |  |
| Volume (ku) Hardware | 2023 | `volume_2023` | Volume 2023 (ku) (Hardware only) |  |
| Volume (ku) Hardware | 2024 | `volume_2024` | Volume 2024 (ku) (Hardware only) |  |
| Volume (ku) Hardware | 2025 | `volume_2025` | Volume 2025 (ku) (Hardware only) |  |
| Volume (ku) Hardware | 2026 | `volume_2026` | Volume 2026 (ku) (Hardware only) |  |
| Volume (ku) Hardware | 2027 | `volume_2027` | Volume 2027 (ku) (Hardware Only) |  |
| Volume (ku) Hardware | 2028 | `asp_in_usd_q2_2022` | Volume 2028 (ku)  (Hardware Only) | RECYCLED: internal name says 2022, label says 2028 → resolve by label |
| Volume (ku) Hardware | 2028 | `asp_in_usd_q1_2022` | Volume 2028 (ku) (Hardware Only)(IGNORE) | RECYCLED: internal name says 2022, label says 2028 → resolve by label |
| Volume (ku) Hardware | 2029 | `volume_2029__ku___hardware_only_` | Volume 2029 (ku) (Hardware Only) |  |
| Weighted (k$) | 2022 | `weighted_2022_calculation` | Weighted 2022 (k$) |  |
| Weighted (k$) | 2023 | `weighted_2023_calculation` | Weighted 2023 (k$) |  |
| Weighted (k$) | 2024 | `weighted_2024_calculation` | Weighted 2024 (k$) |  |
| Weighted (k$) | 2025 | `weighted_2025_calculation` | Weighted 2025 (k$) |  |
| Weighted (k$) | 2026 | `weighted_2026_calculation` | Weighted 2026 (k$) |  |
| Weighted (k$) | 2027 | `weighted_2021_calculation` | Weighted 2027 (k$) | RECYCLED: internal name says 2021, label says 2027 → resolve by label |
| Weighted (k$) | 2028 | `asp_in_usd_q1_2022_calculation` | Weighted 2028 (k$) | RECYCLED: internal name says 2022, label says 2028 → resolve by label |
| Weighted (k$) | 2029 | `weighted_2029_k` | Weighted 2029 (k$) |  |
| Weighted (k$) [BI variant] | 2027 | `amount_lost` | Weighted2027[BI] | RECYCLED: internal name has no year → resolve by label |
| Weighted Volume (ku) | 2023 | `calculation___cumulative_weighted_2021` | Weighted Volume 2023 (ku) | RECYCLED: internal name says 2021, label says 2023 → resolve by label |
| Weighted Volume (ku) | 2024 | `calculation___cumulative_weighted_2022` | Weighted Volume 2024 (ku) | RECYCLED: internal name says 2022, label says 2024 → resolve by label |
| Weighted Volume (ku) | 2025 | `calculation___cumulative_weighted_2024` | Weighted Volume 2025 (ku) | RECYCLED: internal name says 2024, label says 2025 → resolve by label |
| Weighted Volume (ku) | 2026 | `calculation___cumulative_weighted_2023` | Weighted Volume 2026 (ku) | RECYCLED: internal name says 2023, label says 2026 → resolve by label |
| Weighted Volume (ku) | 2027 | `calculation___cumulative_weighted_2025` | Weighted Volume 2027 (ku) | RECYCLED: internal name says 2025, label says 2027 → resolve by label |
| Weighted Volume (ku) | 2028 | `asp_in_usd_q1_2023_calculation` | Weighted Volume 2028 (ku) | RECYCLED: internal name says 2023, label says 2028 → resolve by label |
| Weighted Volume (ku) | 2029 | `weighted_volume_2029_ku` | Weighted Volume 2029 (ku) |  |

## 4. Enum quick reference

**Pipelines** (`pipeline`): `12096408` = SealSQ Hardware, `13772279` = SealSQ Services, `40296576` = Wisekey Services + PKI, `875072356` = Wise.Sat, `705868909` = SEALCOIN, `766126206` = Icalps_hardware, `934982230` = Quantum & AI

**Stages** (`dealstage`, pipeline-specific): `12096409` = Identified (SealSQ Hardware); `12096410` = Qualified (SealSQ Hardware); `12096411` = Design In (SealSQ Hardware); `12096412` = Design Win (SealSQ Hardware); `12096869` = Closed Won (SealSQ Hardware); `12096415` = Closed Lost (SealSQ Hardware); `13772274` = Closed Dead (SealSQ Hardware); `13772280` = Identified (SealSQ Services); `13772281` = Qualified (SealSQ Services); `13772282` = Design In (SealSQ Services); `31868514` = Design Win (SealSQ Services); `13772285` = Closed Won (SealSQ Services); `13772286` = Closed Lost (SealSQ Services); `13772309` = Closed Dead (SealSQ Services); `85103752` = Identified (Wisekey Services + PKI); `85103753` = Qualified (Wisekey Services + PKI); `85103754` = Design In (Wisekey Services + PKI); `85103755` = Design Win (Wisekey Services + PKI); `85103756` = Closed Won (Wisekey Services + PKI); `85103757` = Closed Dead (Wisekey Services + PKI); `85103758` = Closed lost (Wisekey Services + PKI); `1311252059` = Identified (Wise.Sat); `1311252060` = Qualified (Wise.Sat); `1311252061` = Design In (Wise.Sat); `1311252062` = Design Win (Wise.Sat); `1311252063` = Closed Won (Wise.Sat); `1311252064` = Closed Dead (Wise.Sat); `1311252065` = Closed lost (Wise.Sat); `1031449001` = Identified (SEALCOIN); `1031449002` = Qualified (SEALCOIN); `1031449003` = Design In (SEALCOIN); `1031449004` = Design Win (SEALCOIN); `1031449005` = Closed Won (SEALCOIN); `1031449006` = Closed Lost (SEALCOIN); `1116419644` = Identified (Icalps_hardware); `1116419645` = Qualified (Icalps_hardware); `1116419646` = Design In (Icalps_hardware); `1116419647` = Design Win (Icalps_hardware); `1116419649` = Closed Won (Icalps_hardware); `1116419650` = Closed Dead (Icalps_hardware); `1116652341` = On-Hold (Icalps_hardware); `1313738265` = Closed Lost (Icalps_hardware); `1437101470` = Identified (Quantum & AI); `1437101471` = Qualified (Quantum & AI); `1437101472` = Design In (Quantum & AI); `1437101473` = Negociating (Quantum & AI); `1437101474` = PO Sent (Quantum & AI); `1437101475` = Closed Won (Quantum & AI); `1437101476` = Closed Lost (Quantum & AI)

**Products** (`prod___product_name_new_`): `INES`, `SEALBOX`, `SCR400`, `SCR200`, `SCR075`, `VIC420`, `VIC408`, `QVault 409` (label VIC409), `VIC405 1.2.5`, `VIC405 1.0.1 (LEGACY)`, `VIC405 1.2.1 (LEGACY)`, `VIC405 1.2.6 (CUSTOM - BK Tech)`, `VIC292`, `VIC186`, `VIC183`, `VIC100`, `VIC155`, `Nanoseal`, `QS7001`, `QVault TPM IOT`, `QVault TPM`, `MS6003`, `MS6001`, `104104CV`, `4040CV`, `SO128`, `SO64`, `SO36`, `Quack2 (CISCO)`, `Quack2 HT (CISCO)`, `Act2L v1.3 (CISCO)`, `Act2L v1.5 (CISCO)`, `Wise.Sat`, `SEALCOIN`, `Wise.Art/NFT`, `PKI`, `PKI/GSMA`, `PKI/Other`, `Undefined` (label ASIC), `NRE`, `Legacy`, `OCI`, `N/A`

**Product hierarchy**: `SCR`, `600x` (MS600x), `VIC`, `ASIC`, `Legacy`, `PKI`, `TPM`, `CISCO`  ·  **Product line**: `ASIC`, `Quantum Shield`, `PKI`, `TPM`, `Legacy`  ·  **Service name**: `PKI Service`, `Digital Signature`, `WiseID`, `SSL Certificates`, `Custom/MPKI/TLS (WK)`, `FTK`, `Pre-Study`, `Satellite Service (Wise.Sat)`, `NRE (SEALSQ)`, `PKI (SEALSQ)`, `Quantum (SEALSQ)`

**Flags**: `pqc_required` ∈ {YES, NO, Unknown} · `fips_required` ∈ {Yes, No, Unknown} · `military_application` ∈ {Yes, No} · `vaultitrust_` ∈ {true, false} · `tpm_qvault___qs7001___ip__` ∈ {Yes, No} · `new_lead__`/`new_design_in__`/`new_design_win__` ∈ {YES, NO}

**Other**: `sales_region` ∈ {EMEA, APAC, NORAM, TAIWAN} · `opp_cust___channel_var__new_` ∈ {Distributor, Direct, Channel, Rep, Web} · `revenue_state` ∈ {Pipeline, Forecast, BIBA} · `hs_manual_forecast_category` ∈ {OMIT, COMMIT, CLOSED} · `forecast_source` ∈ {Salesman estimate, Customer Conversation, Customer Forecast, Salesman update} · `stratification_of_lost_deals` ∈ {Competition, No Activity, Product Issue, End of Life/Stale Project, Other, Unknown} · `dealtype` ∈ {newbusiness, existingbusiness, existingbusinessre} · `icalps__sealsq` ∈ {SEALSQ, IC'Alps} · `wisekey___seal` ∈ {Seal, Wisekey} · `quote_status` ∈ {Create, Completed} · `hs_priority` ∈ {low, medium, high} · `deal_currency_code` ∈ {USD, EUR}

## 5. HubSQL cheat-sheet

- **FROM** — One object per query: DEAL, COMPANY, CONTACT, TICKET, CALL, MEETING, NOTE, TASK (upper-case). No JOIN / UNION / subqueries / CTEs.
- **SELECT** — Plain property names only. NOT supported: DISTINCT, AS aliases, CASE WHEN, IF(), string functions (CONCAT/UPPER…), COALESCE.
- **Identifier** — Record id is hs_object_id (never 'id').
- **Money** — Aggregate on amount_in_home_currency / hs_projected_amount_in_home_currency. Display amount with deal_currency_code.
- **WHERE ops** — Operators: =, !=, <, >, <=, >=, LIKE '%x%', IS NULL, IS NOT NULL, IN (...), BETWEEN 'YYYY-MM-DD' AND 'YYYY-MM-DD'.
- **Booleans** — hs_is_closed = false / true (unquoted). Custom yes/no enums are quoted strings and case-sensitive ('YES', 'Yes', 'true').
- **Enums** — Filter on the option VALUE, not the label (pipeline = '12096408', not 'SealSQ Hardware'; dealstage = '12096412').
- **Dates** — BETWEEN with date strings, not timestamps. DATE_TRUNC(prop, 'DAY'|'WEEK'|'MONTH'|'QUARTER'|'YEAR') in SELECT and GROUP BY.
- **Aggregates** — COUNT(*), SUM, AVG, MIN, MAX, MEDIAN. No HAVING. No COUNT(DISTINCT x) → use GROUP BY x + COUNT(*).
- **Cross-object** — SELECT COMPANY.name FROM DEAL … / WHERE COMPANY.industry = 'X'. Existence: WHERE associations.DEAL IS NOT NULL (WHERE only). Max 2 associated object types per query.
- **Lists** — hs_crm_search.ilsListIds = 'LIST_ID' (cannot combine with aggregates/GROUP BY).
- **Ownership** — 'my/I/me' → hubspot_owner_id = '<owner id>' resolved from user details; otherwise the query covers the whole portal.
- **Ordering** — ORDER BY col ASC|DESC, LIMIT n.
- **Before querying** — Confirm names with search_properties; confirm enum values with get_properties; then query.

## 6. Ontology drift found (fix the ontology file)

| Object | Ontology name | Finding |
|---|---|---|
| Company | `icalps_company_sector` | Not found. Live candidates: comp_sector, market_segment, icalps_industry_drill_down, hs_industry_group |
| Company | `icalps_comp_territory` | Not found in live portal (no territory property surfaced by search) |
| Contact | `icalps_department` | Not found in live portal |
| Ticket | `icalps_case_status` | Not found. Live ICALPS ticket props: icalps_ticketstage, icalps_ticketcasetype |
| Ticket | `icalps_case_stage` | Not found. Live: icalps_ticketstage |
| Ticket | `icalps_case_priority` | Not found. Use hs_ticket_priority |
| Ticket | `icalps_assigned_user_id` | Not surfaced by search; verify or use hubspot_owner_id |
| Ticket | `icalps_assigned_user_email` | Not surfaced by search |
| Ticket | `icalps_assigned_user_name` | Not surfaced by search |
| Ticket | `icalps_company_id` | Live name is icalps_companyid (no underscore) |
| Ticket | `icalps_company_name` | Live name is icalps_ticketcompanyname |
| Ticket | `icalps_company_website` | Not surfaced by search |
| Ticket | `icalps_contact_firstname` | Live name is icalps_ticketpersonfirstname |
| Ticket | `icalps_contact_lastname` | Live name is icalps_ticketpersonlastname |
| Ticket | `icalps_contact_email` | Live name is icalps_ticketpersonemailaddress |
| Opportunity | `icalps_EffectiveCloseDate` | Live name is icalps_closedate (label IcAlps_EffectiveCloseDate) — lowercase |
| Opportunity | `company_association` | Not a property. Use cross-object syntax COMPANY.name / associations.COMPANY |
| Opportunity | `contact_association` | Not a property. Use CONTACT.email / associations.CONTACT |

## 7. Prompt template for a business user (fill the brackets)

```
Object: [DEAL | COMPANY | CONTACT | TICKET]
Filter: [property internal name] = '[exact enum value]'   (copy both from the workbook)
Status: hs_is_closed = false | hs_is_closed_won = true | hs_is_closed_lost = true
Money: SUM(amount_in_home_currency) | SUM(hs_projected_amount_in_home_currency)
Period: [closedate | createdate | design_win_date] BETWEEN 'YYYY-MM-DD' AND 'YYYY-MM-DD'
Group by: [property]
Do not match on dealname unless I say so.
```