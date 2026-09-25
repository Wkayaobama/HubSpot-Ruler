
Consider the following situation

3 companies are sharing the same CRM

SEALSQ ICALPS and Wisekey

Note : the 1st ICAlps From memory you should be easily able to get enough content to be up to speed

each of them shares some common ground and are intending to use cross sell between them, that being said, it's adbisible to set boundaries between the surface of intereaction of each stakeholder

Brands (formerly known as business unit) was intendeding to solve this issue by creating a layer of operation for each of the stakeholder, which would be scalable

Let's say that each companies is selling different kind of products and services and wants to communicate on those by interfacing with the crm

let's consider that there is also an underneath data model that is property segmented between all of the entities

Let's draw a plan that

1. Classify all of the records pertaining to an entity
2. Create a generalised ontology that contextualise all of which pertain to entity A,B.. or X
This is key having a representation or blueprint of each entity property should be one of the first action to be undertaken in the project.

Actually the blueprint layer could even be subject to a pydantic model that automatically classified each one of the properties that belongs to an entity 

3. Leverage business Units either through UI or API to create custom assets for each brand including the default hubspot creation form (check if it's possible) if not possible then we would have to create another serverless workflow for entity X which is feasible but clunky
4. If Business Units are not flexible enough we will create team custom card and **views** that will basically emulate that feeling

We want to leverage the business unit as much as possible so that each business units has a sense of self awareness

as of now the business unit only offers that level of customisation through the forms and the content, how could we also include the data side of thing so that each brand feels at home ? Non only for the cosmetic but also with the data driven materials that enables it to feel and act that way

WE only have 1 business unit, which is an iherhent limitation, the business unit will cover all of the entities that will joins the company that are neither one of SEALSQ or ICALPS


II- The frontier orchestration of the strategy


The discovery phase of each entity model can be done as of now, with the material, however the scoring and actionnable system that pertains to the actual enablement of each stakeholder needs to be thought out more in depth

There will be 3 agents

1 that gather context of company A (SEALSQ)
1 that gather context of company B (IC'Alps)
1 that gather context of company C (MIRAEX)
1 that gather context of company D (WeCan)

All are acting in a centralised repo governed by ruler

https://github.com/intellectronica/ruler

Operator and aprtier involvment.
While the underlying data layer is agentic, the splitting through teams, and conditionnal viewing of properties will be done by the operator and it's hubpsot partner so this is orthogonal to the current implementation

The context is of course made available through the ontology (or Blueprint that generalised all of the companies properties,schema and identiy)

For each of your decision I want you to weigh in the actual leverage of business unit vs the standard technical execution of code either standalone or mediated through database (Postgres,Bigquery,HubsQL)

The data is small, hence why you can already have a good overview using simple excel sheets


III- The Foundation

While the agent are scoped to a singular context the foundation model is overseeing the state of the CRM in terms of drifs and dataquality issues such as dupplicates, orphans, stale, or poorly exploitable data


hermes agent folder is the blueprint for interoperability between the subagent and the foundation model