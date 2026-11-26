// The two stages, their people, and their scenarios. Each scenario says which weak spots it
// exercises most, so today's pick can aim at the weakest ones.
import type { MistakeType, RegionId, StageId } from './model'

export interface Scenario {
  id: string
  stage: StageId
  /** Short title (English, for the screen). */
  title: string
  /** One line: what you'll do. */
  goal: string
  /** For the tutor: the situation, roles and what to steer toward. */
  brief: string
  /** Structures and words to bring in. */
  targets: string
  focus: MistakeType[]
  /** The phone call: no text on screen, faster voice. */
  phone?: boolean
}

export interface Stage {
  id: StageId
  name: string
  who: string
  /** Speech recognition / voice language. */
  lang: 'es-MX' | 'es-CO'
}

export const STAGES: Record<StageId, Stage> = {
  1: { id: 1, name: 'Stage 1', who: 'Rosa, your housekeeper', lang: 'es-MX' },
  2: { id: 2, name: 'Stage 2', who: 'Catalina, your Colombian friend', lang: 'es-CO' },
}

export const REGIONS: Record<RegionId, { label: string; city: string; flavor: string }> = {
  bogota: {
    label: 'Bogotá (rolo)', city: 'Bogotá',
    flavor: 'Bogotá, upper-middle-class "rolo" Spanish: very polite, measured, "usted" even with close friends. Natural expressions: "qué pena con usted", "con mucho gusto", "¡qué chévere!", "regáleme…" / "¿me regala…?", "un tinto", "las onces", "¿bien o qué?" (light), "sumercé" only rarely and affectionately.',
  },
  medellin: {
    label: 'Medellín (paisa)', city: 'Medellín',
    flavor: 'Medellín (paisa), educated: warm and enthusiastic, "usted" with friends, the filler "pues" ("sí, pues", "hágale pues"), tag "¿cierto?", "¡qué bacano!" / "¡qué chévere!", "con mucho gusto", "qué pena". Never "parce/parcero" or street slang.',
  },
  cali: {
    label: 'Cali (caleño)', city: 'Cali',
    flavor: 'Cali (caleño), educated: lively, salsa city; caleños often use "vos" among friends, but use "usted" with the learner (new friend) and only mention voseo if asked. "Vea…", "¡qué chévere!", "¿sí o qué?", "con mucho gusto", "qué pena con usted".',
  },
  costa: {
    label: 'Caribbean coast (Barranquilla)', city: 'Barranquilla',
    flavor: 'Barranquilla / Caribbean coast, educated: cheerful and quick, "¡Ajá!", "¡qué nota!", "¡qué chévere!"; tuteo is common on the coast, but use mostly "usted" with the learner (new friend). No vulgar slang.',
  },
  santander: {
    label: 'Bucaramanga (santandereano)', city: 'Bucaramanga',
    flavor: 'Bucaramanga (santandereano), educated: direct and warm, "usted" with everyone, even family; "¡hágale!", "¡qué chévere!", "qué pena con usted", "con mucho gusto". No vulgar slang.',
  },
}

export const SCENARIOS: Scenario[] = [
  // ---- Stage 1: Rosa, the housekeeper (Mexico City)
  {
    id: 'tasks', stage: 1, title: "Today's cleaning list", goal: 'Give Rosa today’s tasks, politely.',
    brief: 'Morning. The learner (Rosa’s employer) gives Rosa the day’s cleaning tasks. Rosa asks short practical questions: which room first, which product, what time, anything special.',
    targets: 'Polite usted imperatives: "Limpie la cocina, por favor", "Lave los platos", "Barra y trapee el piso", "Tienda las camas", "Sacuda los muebles"; "¿Podría…?"; present tense; primero / después / luego.',
    focus: ['verb', 'vocab'],
  },
  {
    id: 'guests', stage: 1, title: 'Guests tonight', goal: 'Ask Rosa for special help: guests are coming.',
    brief: 'Friends are coming for dinner tonight. The learner asks Rosa for special help (guest room, groceries, setting the table, maybe staying later). Rosa asks what time, how many people, what to buy.',
    targets: 'ir a + infinitive ("Van a venir seis personas"), "¿Podría quedarse hasta las ocho?", numbers and times, polite imperatives, food and table vocabulary.',
    focus: ['verb', 'listening', 'vocab'],
  },
  {
    id: 'laundry', stage: 1, title: 'Laundry and ironing', goal: 'Explain how to wash and iron some delicate clothes.',
    brief: 'The learner explains a special laundry request: delicate clothes, cold water, no bleach, iron the shirts, hang the sweaters. Rosa checks details and mentions the detergent is almost finished.',
    targets: 'Clothes and colors with gender agreement ("la camisa blanca", "los suéteres negros"), "agua fría", "sin cloro", "planchar", "colgar", imperatives with pronouns ("Lávela a mano").',
    focus: ['gender', 'vocab', 'french'],
  },
  {
    id: 'howareyou', stage: 1, title: 'How is Rosa doing?', goal: 'Small talk: ask how Rosa is and follow up.',
    brief: 'Small talk at the start of the day. Rosa was a bit sick last week and is better now; her daughter has an important exam. The learner asks how she is and follows up with questions.',
    targets: 'Present tense, "¿Cómo se siente?", "¿Ya está mejor?", "¡Qué bueno!", "¡Qué lástima!", ser vs estar, short reactions; questions at natural speed.',
    focus: ['listening', 'verb', 'gender'],
  },
  {
    id: 'family', stage: 1, title: "Rosa's family", goal: 'Talk about families: hers and yours.',
    brief: 'Rosa talks about her family (two children and a grandson, who live in Puebla and Mexico City). She asks about the learner’s family too.',
    targets: 'Family words, ages ("tiene diez años"), possessives (su / sus), gender agreement, present tense of tener / vivir / trabajar.',
    focus: ['vocab', 'gender', 'verb'],
  },
  {
    id: 'weekend', stage: 1, title: 'Her weekend', goal: 'Ask what she did and what she’s going to do.',
    brief: 'Monday. Rosa went to a family party in Xochimilco this weekend. The learner asks what she did, and both talk about plans for next weekend.',
    targets: 'Simple past ("¿Qué hizo el fin de semana?", "Fui…", "Comimos…"), ir a + infinitive ("¿Qué va a hacer el sábado?"), ayer / el sábado / la próxima semana.',
    focus: ['verb', 'listening'],
  },
  {
    id: 'broken', stage: 1, title: 'Something broke', goal: 'Find out what happened and decide what to do.',
    brief: 'Rosa tells the learner the washing machine leaked water this morning (or the vacuum stopped working). The learner asks what happened and decides what to do.',
    targets: 'Simple past ("Se descompuso", "¿Qué pasó?", "Salió agua"), "no funciona", "está roto/rota", appliance words, "Hay que llamar al técnico".',
    focus: ['verb', 'vocab', 'listening'],
  },
  {
    id: 'missing', stage: 1, title: 'Something is missing', goal: 'Ask Rosa if she has seen something; plan what to buy.',
    brief: 'The learner can’t find something (car keys or the TV remote) and some cleaning supplies have run out. Ask Rosa if she has seen it and make a short shopping list.',
    targets: 'Location words "aquí / ahí / allá" (French speakers say "là"), "¿Ha visto…?" (just recognise it), "se acabó / se acabaron", cleaning products, "¿Dónde está…?".',
    focus: ['french', 'vocab', 'listening'],
  },
  {
    id: 'repair', stage: 1, title: 'Fixing the leak', goal: 'Arrange a plumber with Rosa’s help.',
    brief: 'The kitchen faucet drips. Rosa knows a good plumber ("plomero"). Together they arrange when he’ll come, how much it costs, and who will be home.',
    targets: 'ir a + infinitive ("El plomero va a venir el jueves"), days and times, prices, "¿A qué hora?", "¿Cuánto cobra?", polite requests.',
    focus: ['verb', 'listening', 'vocab'],
  },
  // ---- Stage 2: Catalina, the Colombian friend
  {
    id: 'catchup', stage: 2, title: 'Catching up over a tinto', goal: 'Catch up on each other’s week.',
    brief: 'Catalina and the learner meet for coffee ("un tinto") and catch up: work, family, the week.',
    targets: 'Present and simple past, follow-up questions, reactions ("¡qué chévere!", "¡no me diga!"), usted.',
    focus: ['verb', 'listening'],
  },
  {
    id: 'stories', stage: 2, title: 'Opinions and stories', goal: 'Tell a short story and give your opinion.',
    brief: 'Catalina tells a funny story from a recent family trip and asks for the learner’s own story and opinions (a film, a book, the city).',
    targets: 'Past tense narration (fui, vi, hicimos; era / había as recognition), "creo que…", "me parece que…", "en mi opinión", connectors (entonces, después, al final).',
    focus: ['verb', 'vocab'],
  },
  {
    id: 'travel', stage: 2, title: 'A trip in Colombia', goal: 'Plan a trip with her recommendations.',
    brief: 'The learner is planning a trip to Colombia; Catalina recommends places (Cartagena, the coffee region, Medellín, Villa de Leyva) and practical tips.',
    targets: 'ir a + infinitive, comparisons ("más bonito que"), "le recomiendo…", "vale la pena", travel vocabulary, dates and seasons.',
    focus: ['vocab', 'verb', 'listening'],
  },
  {
    id: 'food', stage: 2, title: 'Colombian food', goal: 'Talk about dishes you love or want to try.',
    brief: 'Catalina talks about Colombian dishes (ajiaco, arepas, bandeja paisa, changua, buñuelos, lechona) and asks about French food.',
    targets: '"me encanta / me gusta / no me gusta tanto", gender of food words, "¿Ha probado…?" (recognise), describing tastes.',
    focus: ['gender', 'vocab', 'french'],
  },
  {
    id: 'culture', stage: 2, title: 'Music, books and festivals', goal: 'Talk about culture: music, books, festivals.',
    brief: 'Culture chat: vallenato and cumbia, García Márquez, Botero, the Feria de las Flores, Carnaval de Barranquilla. Catalina asks what the learner likes.',
    targets: 'Opinions, past tense ("¿Lo leyó?", "Fui una vez…"), culture vocabulary, French–Spanish false friends.',
    focus: ['vocab', 'french', 'listening'],
  },
  {
    id: 'business', stage: 2, title: 'A business conversation', goal: 'Present your work and make a polite request.',
    brief: 'A professional conversation: Catalina introduces the learner to a business contact situation; the learner presents their work and makes a polite request (a meeting, an introduction).',
    targets: 'Formal usted, "¿Sería posible…?", "Me gustaría…", "Quedo atento/atenta", work vocabulary, numbers and dates.',
    focus: ['verb', 'vocab', 'french'],
  },
  {
    id: 'invite', stage: 2, title: 'Invitations', goal: 'Accept one invitation and gracefully decline another.',
    brief: 'Catalina invites the learner to two things: a dinner at her home on Friday and a weekend at her family’s finca. The learner accepts one and declines the other gracefully.',
    targets: '"Con mucho gusto", "Me encantaría, pero…", "Qué pena con usted, ese fin de semana tengo…", "¿Qué llevo?", ir a + infinitive.',
    focus: ['verb', 'listening'],
  },
  {
    id: 'phone', stage: 2, title: 'A phone call at real speed', goal: 'She calls to change plans: understand and confirm.',
    brief: 'Catalina phones the learner to change Saturday’s plans: new time, new place, someone else joining. Real phone speed, no visual cues. The learner must understand and confirm the details.',
    targets: '"¿Aló?", "¿Me escucha?", "¿Me repite la dirección, por favor?", times, addresses, confirming ("Entonces nos vemos a las…").',
    focus: ['listening', 'verb'],
    phone: true,
  },
]

export const scenario = (id: string) => SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0]
export const stageScenarios = (stage: StageId) => SCENARIOS.filter((s) => s.stage === stage)
