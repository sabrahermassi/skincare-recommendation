import type { ActiveKey } from "@/lib/skin-needs-data";

/**
 * Every word of the skincare tip on Home (handoff_home_and_tip), in one file
 * so it can be edited without touching the screen. A tip is one short line,
 * written in the hand face, and one reason under it. Placeholder copy for the
 * morning, evening and rest-night tips (owner, 3 October 2026), held to the
 * claims policy by `__tests__/claims-policy.test.ts`.
 */
export type Tip = { tip: string; why: string };

/**
 * No routine yet: a general tip, a new one each day. The tips are the owner's
 * (29 September 2026), word for word; the reasons were added with the
 * envelope (owner, 3 October 2026).
 */
export const GENERAL_TIPS: readonly Tip[] = [
  { tip: "Double cleanse at night — oil or butter first, then a gentle foaming wash.", why: "The first wash lifts sunscreen and makeup; the second cleans the skin itself." },
  { tip: "Pat toner into skin with your palms instead of rubbing it in.", why: "Pressing is gentler than rubbing, and less of it ends up on your hands." },
  { tip: "Layer products from thinnest to thickest, watery to creamy.", why: "Thin layers sink in first. A thick cream underneath would keep the rest from reaching your skin." },
  { tip: "Sunscreen belongs in your routine even on cloudy or indoor days.", why: "UV gets through clouds and windows, so daylight still counts." },
  { tip: "Patch test a new product before adding it to your full routine.", why: "A small spot for a few days shows how your skin takes it before your whole face does." },
  { tip: "Damp skin holds hydration well, so apply essence right after washing.", why: "Hydrating layers have water to hold on to while your skin is still a little damp." },
  { tip: "A few products used consistently beat ten used occasionally.", why: "Skin changes slowly. Steady use gives a product time to work." },
  { tip: "Sheet masks are a nice pause, not a fifteen-minute miracle.", why: "They add a little hydration. The real work is your everyday routine." },
  { tip: "Your neck and hands enjoy moisturizer just as much as your face.", why: "They see the same sun and weather as your face does." },
  { tip: "Lukewarm water is gentler on skin than a hot, steamy rinse.", why: "Hot water strips the oils your skin wants to keep." },
  { tip: "Change your pillowcase often — it touches your face all night.", why: "Oil, sweat and product build up on it night after night." },
  { tip: "Reapply sunscreen through the day, not just once each morning.", why: "Sunscreen wears off with time, sweat and touching your face." },
  { tip: "A humid room can make dry winter skin feel a little happier.", why: "Dry indoor air pulls water from your skin. A little humidity slows that down." },
  { tip: "Skin doesn't need every step every day — some rest is okay.", why: "Rest days give your skin time between the stronger steps." },
  { tip: "Toner preps skin to take in what comes after it more easily.", why: "A damp, toned face takes the next layer more evenly." },
  { tip: "Centella and rice water are gentle picks for sensitive days.", why: "Both are known for being mild and soothing." },
  { tip: "Ampoules are for the days your skin wants a little extra care.", why: "They're concentrated, so they suit the days your skin asks for more." },
  { tip: "Removing makeup before bed lets your skin breathe overnight.", why: "Makeup left on overnight can clog pores and dull your skin." },
  { tip: "Consistency matters more than switching products every week.", why: "Most products need weeks of steady use to show what they can do." },
  { tip: "Chilled products can feel calming on puffy morning skin.", why: "Cool temperatures feel soothing and can help skin look less puffy." },
  { tip: "Silk pillowcases cause less friction than cotton overnight.", why: "Smoother fabric pulls less at your skin and hair." },
  { tip: "Try not to touch your face too often throughout the day.", why: "Hands carry oil and dirt to your skin all day long." },
  { tip: "Body skin deserves the same gentle attention as your face.", why: "It has the same needs: a gentle wash, moisturiser, and SPF where the sun reaches." },
  { tip: "Skin needs shift with the seasons, so routines can shift too.", why: "Cold, dry months often want richer creams; warm months, lighter ones." },
  { tip: "A slower night routine lets each layer settle in properly.", why: "A minute between layers lets each one sink in before the next." },
  { tip: "Staying hydrated is good for your whole body, skin included.", why: "Water and sleep show up on your skin too." },
  { tip: "Bad skin days don't undo all the good care you've given it.", why: "One day doesn't erase weeks of care. Keep going." },
  { tip: "Your skin is more than something to fix — it's just yours.", why: "Caring for it is about feeling good, not chasing perfect." },
  { tip: "A breakout doesn't cancel out how well you're taking care of you.", why: "Breakouts happen to everyone. Your routine still counts." },
  { tip: "Skincare can be gentle on your skin and gentle on your mind too.", why: "A routine you enjoy is one you'll keep." },
  { tip: "You're allowed to like your skin exactly as it looks today.", why: "Your skin doesn't need to change to be cared for." },
];

/** A routine's morning tip: about the SPF, a new one each day (hand-off: "This morning: about your SPF"). */
export const MORNING_TIPS: readonly Tip[] = [
  { tip: "SPF protects everything else you do.", why: "Sun makes marks darker and undoes your actives. Two fingers of SPF, every morning." },
  { tip: "Two fingers of SPF.", why: "Two finger-lengths covers your face and neck. Less gives less protection than the label says." },
  { tip: "Take it down your neck.", why: "Your neck sees as much sun as your face. Carry the SPF past your jaw." },
  { tip: "SPF goes on last.", why: "Sunscreen is the final morning step, after moisturiser. Let it set before makeup." },
  { tip: "Cloudy days count too.", why: "Most UV gets through clouds. Wear SPF whatever the weather." },
];

/** A routine's evening tip, about tonight's active (hand-off: "Tonight: about your BHA night"). */
export const EVENING_TIPS: Partial<Record<ActiveKey, Tip>> = {
  bha: { tip: "Wait a minute before moisturiser.", why: "BHA works best on skin that's dry, not damp. Give it a minute to settle, then moisturise." },
  aha: { tip: "One acid a night is plenty.", why: "Skip the other exfoliating acids tonight. Doubling up is where stinging starts." },
  pha: { tip: "A thin layer is enough.", why: "PHA is gentle, but more product doesn't mean more glow. Let it settle, then moisturise." },
  retinoids: { tip: "A pea-sized amount, no more.", why: "One pea covers your whole face. More adds dryness, not results." },
  bakuchiol: { tip: "Smooth it on clean skin.", why: "Bakuchiol sits best right after cleansing, before your moisturiser." },
  azelaic: { tip: "Start with a thin layer.", why: "Azelaic acid can tingle at first. A thin layer gives your skin time to get used to it." },
  benzoyl: { tip: "Mind your pillowcase.", why: "Benzoyl peroxide can bleach fabric. A white pillowcase saves your favourite ones." },
  "vitamin-c": { tip: "Let it sink in first.", why: "Give vitamin C a minute before the next layer, so it isn't wiped around." },
  niacinamide: { tip: "Follow it with moisturiser.", why: "Niacinamide plays well with most things. Moisturiser on top keeps your skin comfortable." },
  hydrating: { tip: "Apply it on damp skin.", why: "Hyaluronic acid holds the water it finds. Damp skin gives it some; moisturiser keeps it there." },
  tranexamic: { tip: "Steady beats strong.", why: "Tranexamic acid works slowly. Using it most nights matters more than using a lot." },
  arbutin: { tip: "Give it a few weeks.", why: "Arbutin fades marks over weeks, not days. A thin layer, night after night." },
  peptides: { tip: "Before the thicker creams.", why: "Peptides are usually light serums. Thin to thick lets each layer sit where it should." },
  ceramides: { tip: "Make it your last step.", why: "Ceramides help hold water in. Last on, they keep everything under them comfortable." },
  calming: { tip: "Press it in gently.", why: "Centella is there to keep skin calm. Pressing instead of rubbing keeps it that way." },
  zinc: { tip: "A little goes a long way.", why: "Zinc helps with shine. A thin layer is enough, then your moisturiser." },
  sulfur: { tip: "Only where you need it.", why: "Sulfur can be drying. Using it on spots alone keeps the rest of your skin comfortable." },
  oat: { tip: "A soft night for your skin.", why: "Oat feels soft and comforting. It's a good pick on nights your skin feels tight." },
  panthenol: { tip: "Layer it under moisturiser.", why: "Panthenol draws in water and softens. Your moisturiser then keeps it there." },
  glycerin: { tip: "Seal it in.", why: "Glycerin pulls water into your skin. A moisturiser on top keeps it from drying off." },
  squalane: { tip: "A few drops, last.", why: "Squalane is a light oil. Two or three drops after moisturiser soften without feeling greasy." },
  "vitamin-e": { tip: "Save it for dry patches.", why: "Vitamin E is rich. It's most welcome where your skin feels driest." },
  ferulic: { tip: "Keep the bottle cool and closed.", why: "Ferulic acid helps antioxidants last, and light and air wear them down." },
  "copper-peptides": { tip: "Keep acids for another night.", why: "Copper peptides and strong acids don't mix well. Give each its own night." },
  urea: { tip: "Where skin feels rough.", why: "Urea softens rough, dry patches. A thin layer is enough." },
  "green-tea": { tip: "An easy evening step.", why: "Green tea is a gentle antioxidant. It layers easily under your moisturiser." },
};

/** An active with no evening tip of its own. */
export const EVENING_FALLBACK: Tip = { tip: "Go gently tonight.", why: "A thin layer, then moisturiser. Your skin settles best with a calm routine." };

/** No active tonight (hand-off: "Rest night: let your skin recover"). */
export const REST_NIGHT_TIP: Tip = { tip: "Rest night: let your skin recover.", why: "No active tonight. Cleanse, moisturise, and give your skin a night off." };
