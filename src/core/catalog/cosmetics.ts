/**
 * Cosmetic catalog. Shared by client (rendering, Customize, Store) and server (entitlements).
 * Cosmetics never change gameplay. Every item states exactly how it is obtained.
 */
export type Slot = 'outfit' | 'scarf' | 'shoes' | 'gloves' | 'trail' | 'landing' | 'jump' | 'emote' | 'banner' | 'title';

export type Source =
  | { kind: 'default' }
  | { kind: 'achievement'; id: string }
  | { kind: 'medal'; trial: string | 'any' | 'all'; medal: 'gold' | 'perfect' }
  | { kind: 'purchase'; sku: string };

export interface Cosmetic {
  id: string;
  slot: Slot;
  source: Source;
  /** Render parameters. Colours are 0xRRGGBB. */
  look?: { jacket?: number; pants?: number; hood?: number; scarf?: number; shoes?: number; gloves?: number; scarfLength?: number; headwear?: number };
  fx?: { color: number; color2?: number; kind: string };
}

const A = (id: string): Source => ({ kind: 'achievement', id });
const P = (sku: string): Source => ({ kind: 'purchase', sku });
const D: Source = { kind: 'default' };

export const COSMETICS: Cosmetic[] = [
  // outfits
  { id: 'outfit.lowmark', slot: 'outfit', source: D, look: { jacket: 0x8a6a3a, pants: 0x2d3440, hood: 0x6e5530 } },
  { id: 'outfit.builder', slot: 'outfit', source: A('all_lessons'), look: { jacket: 0x5e6b4a, pants: 0x3a3228, hood: 0xc9a24a, headwear: 1 } },
  { id: 'outfit.winchwright', slot: 'outfit', source: A('winch'), look: { jacket: 0x3f5a73, pants: 0x2a3440, hood: 0x2a3440, headwear: 1 } },
  { id: 'outfit.keeper', slot: 'outfit', source: A('storm_runner'), look: { jacket: 0xd4a21e, pants: 0x2c2c2c, hood: 0xd4a21e } },
  { id: 'outfit.cradle', slot: 'outfit', source: A('first_summit'), look: { jacket: 0xe8e0cc, pants: 0xb8a888, hood: 0xe8e0cc } },
  { id: 'outfit.remembered', slot: 'outfit', source: A('remembered'), look: { jacket: 0x2a2f3a, pants: 0x1c1f26, hood: 0xf2e6c8 } },
  { id: 'outfit.night', slot: 'outfit', source: P('vertigo.outfit.night'), look: { jacket: 0x1f2a44, pants: 0x121826, hood: 0x2e3f66, headwear: 0 } },
  { id: 'outfit.cartographer', slot: 'outfit', source: P('vertigo.outfit.cartographer'), look: { jacket: 0x7a4e2e, pants: 0x4a3a2a, hood: 0x2e5a4a, headwear: 1 } },
  { id: 'outfit.festival', slot: 'outfit', source: P('vertigo.outfit.festival'), look: { jacket: 0xb8322e, pants: 0x2e3e8a, hood: 0xf0c040, headwear: 2 } },
  // scarves
  { id: 'scarf.vermilion', slot: 'scarf', source: D, look: { scarf: 0xd8431f } },
  { id: 'scarf.ochre', slot: 'scarf', source: A('first_letter'), look: { scarf: 0xd89a2e } },
  { id: 'scarf.storm', slot: 'scarf', source: A('storm_runner'), look: { scarf: 0x6a8ab8 } },
  { id: 'scarf.void', slot: 'scarf', source: A('beyond_gravity'), look: { scarf: 0x3a2a6a } },
  { id: 'scarf.gold', slot: 'scarf', source: A('unbroken'), look: { scarf: 0xf0c85a } },
  { id: 'scarf.long', slot: 'scarf', source: A('complete_journey'), look: { scarf: 0xe8e0cc, scarfLength: 16 } },
  { id: 'scarf.aurora', slot: 'scarf', source: P('vertigo.scarf.aurora'), look: { scarf: 0x3ad8a8 } },
  { id: 'scarf.ember', slot: 'scarf', source: P('vertigo.scarf.ember'), look: { scarf: 0xff6a2a } },
  // shoes
  { id: 'shoes.default', slot: 'shoes', source: D, look: { shoes: 0xe8e0d0 } },
  { id: 'shoes.chalk', slot: 'shoes', source: A('master_route'), look: { shoes: 0xffffff } },
  { id: 'shoes.gold', slot: 'shoes', source: A('gold_standard'), look: { shoes: 0xd8b04a } },
  { id: 'shoes.neon', slot: 'shoes', source: P('vertigo.shoes.neon'), look: { shoes: 0x3af0c8 } },
  // gloves
  { id: 'gloves.default', slot: 'gloves', source: D, look: { gloves: 0x3a2e28 } },
  { id: 'gloves.brass', slot: 'gloves', source: A('echo_hunter'), look: { gloves: 0xb8923a } },
  { id: 'gloves.climber', slot: 'gloves', source: A('no_way_down'), look: { gloves: 0x8a2a2a } },
  { id: 'gloves.lantern', slot: 'gloves', source: P('vertigo.gloves.lantern'), look: { gloves: 0xffb04a } },
  // trails
  { id: 'trail.none', slot: 'trail', source: D },
  { id: 'trail.chalk', slot: 'trail', source: A('master_route'), fx: { kind: 'dust', color: 0xffffff } },
  { id: 'trail.echo', slot: 'trail', source: A('echo_hunter'), fx: { kind: 'glow', color: 0xffe0a0 } },
  { id: 'trail.ember', slot: 'trail', source: A('all_in'), fx: { kind: 'glow', color: 0xff7a2a, color2: 0xffd060 } },
  { id: 'trail.aurora', slot: 'trail', source: P('vertigo.trail.aurora'), fx: { kind: 'glow', color: 0x3ad8a8, color2: 0x8a6aff } },
  { id: 'trail.origami', slot: 'trail', source: P('vertigo.trail.origami'), fx: { kind: 'paper', color: 0xf3e6c4 } },
  // landing
  { id: 'landing.dust', slot: 'landing', source: D, fx: { kind: 'dust', color: 0xcdbb9a } },
  { id: 'landing.ring', slot: 'landing', source: A('perfect_run'), fx: { kind: 'ring', color: 0xfff0c0 } },
  { id: 'landing.petal', slot: 'landing', source: A('first_summit'), fx: { kind: 'petal', color: 0xffc8d8 } },
  { id: 'landing.lantern', slot: 'landing', source: P('vertigo.landing.lantern'), fx: { kind: 'ring', color: 0xffa040 } },
  // jump
  { id: 'jump.none', slot: 'jump', source: D },
  { id: 'jump.puff', slot: 'jump', source: A('first_fall'), fx: { kind: 'dust', color: 0xe8dcc0 } },
  { id: 'jump.spark', slot: 'jump', source: A('flow'), fx: { kind: 'spark', color: 0xffe080 } },
  { id: 'jump.feather', slot: 'jump', source: P('vertigo.jump.feather'), fx: { kind: 'paper', color: 0xffffff } },
  // emotes
  { id: 'emote.wave', slot: 'emote', source: D },
  { id: 'emote.sit', slot: 'emote', source: A('first_fall') },
  { id: 'emote.bow', slot: 'emote', source: A('daily') },
  { id: 'emote.dance', slot: 'emote', source: P('vertigo.emote.dance') },
  { id: 'emote.handstand', slot: 'emote', source: P('vertigo.emote.handstand') },
  // banners
  { id: 'banner.lowmark', slot: 'banner', source: D, fx: { kind: 'banner', color: 0xe6cfa2, color2: 0x4f86c6 } },
  { id: 'banner.pillar', slot: 'banner', source: A('m1000'), fx: { kind: 'banner', color: 0x9a8a76, color2: 0x2a3a5a } },
  { id: 'banner.storm', slot: 'banner', source: A('storm_runner'), fx: { kind: 'banner', color: 0x3a4250, color2: 0xa8c8ff } },
  { id: 'banner.cradle', slot: 'banner', source: A('first_summit'), fx: { kind: 'banner', color: 0xffe6c0, color2: 0xf0a860 } },
  { id: 'banner.nightsky', slot: 'banner', source: P('vertigo.banner.nightsky'), fx: { kind: 'banner', color: 0x0e1430, color2: 0x8a9aff } },
  { id: 'banner.clouds', slot: 'banner', source: P('vertigo.banner.clouds'), fx: { kind: 'banner', color: 0xffffff, color2: 0x8ab8e8 } },
  // titles
  { id: 'title.climber', slot: 'title', source: D },
  { id: 'title.faller', slot: 'title', source: A('first_fall') },
  { id: 'title.reader', slot: 'title', source: A('first_letter') },
  { id: 'title.archivist', slot: 'title', source: A('archivist') },
  { id: 'title.echo', slot: 'title', source: A('echo_hunter') },
  { id: 'title.keeper', slot: 'title', source: A('storm_runner') },
  { id: 'title.winchwright', slot: 'title', source: A('winch') },
  { id: 'title.ringrider', slot: 'title', source: A('ring') },
  { id: 'title.gravity', slot: 'title', source: A('beyond_gravity') },
  { id: 'title.summiteer', slot: 'title', source: A('first_summit') },
  { id: 'title.unbroken', slot: 'title', source: A('unbroken') },
  { id: 'title.descendant', slot: 'title', source: A('complete_journey') },
  { id: 'title.master', slot: 'title', source: A('master_route') },
  { id: 'title.daily', slot: 'title', source: A('daily') },
];

export const COSMETIC_BY_ID = new Map(COSMETICS.map((c) => [c.id, c]));

export const DEFAULT_EQUIP: Record<Slot, string> = {
  outfit: 'outfit.lowmark',
  scarf: 'scarf.vermilion',
  shoes: 'shoes.default',
  gloves: 'gloves.default',
  trail: 'trail.none',
  landing: 'landing.dust',
  jump: 'jump.none',
  emote: 'emote.wave',
  banner: 'banner.lowmark',
  title: 'title.climber',
};

export const SLOTS: Slot[] = ['outfit', 'scarf', 'shoes', 'gloves', 'trail', 'landing', 'jump', 'emote', 'banner', 'title'];
