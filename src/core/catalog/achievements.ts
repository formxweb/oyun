/**
 * Achievement catalog. `steam` is the API name configured in Steamworks. On Google Play the id
 * is resolved on the device from the Play Console's exported games-ids.xml resource
 * `achievement_<id>` (platforms/android), so no console-assigned ids live in code.
 */
export interface AchievementDef {
  id: string;
  steam: string;
  hidden: boolean;
  /** Progress target for incremental achievements (shown as n / target). */
  target?: number;
}

const def = (id: string, hidden = false, target?: number): AchievementDef => ({
  id,
  steam: 'ACH_' + id.toUpperCase(),
  hidden,
  target,
});

export const ACHIEVEMENTS: AchievementDef[] = [
  def('first_fall'),
  def('caught'),
  def('first_letter'),
  def('bell'),
  def('m1000', false, 1000),
  def('m5000', false, 5000),
  def('long_fall'),
  def('no_way_down'),
  def('master_route'),
  def('winch'),
  def('ring'),
  def('storm_runner'),
  def('beyond_gravity'),
  def('first_summit'),
  def('complete_journey', false, 30),
  def('archivist', false, 20),
  def('echo_hunter', false, 25),
  def('all_lessons', false, 12),
  def('perfect_run'),
  def('gold_standard', false, 10),
  def('unbroken', false, 10),
  def('daily'),
  def('ghost'),
  def('flow'),
  def('all_in'),
  def('roll'),
  def('sub60'),
  def('sub30'),
  def('remembered', true),
];

export const ACHIEVEMENT_IDS = new Set(ACHIEVEMENTS.map((a) => a.id));
