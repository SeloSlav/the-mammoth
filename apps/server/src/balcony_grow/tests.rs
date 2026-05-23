use spacetimedb::Identity;

use super::{
    apply_substrate_to_plants, grow_speed_modifier, harvest_bonus_count, harvest_food_count,
    harvest_seed_count, is_known_tray_id, target_days_after_fertilizer, tray_dry_nights_after_sleep,
    tray_water_after_sleep_nights, BalconyGrowPlant, HarvestCareContext,
    BALCONY_GROW_TRAY_BUILTIN_IDS, BALCONY_GROW_TRAY_MAX_WATER_L,
    BALCONY_GROW_TRAY_WATER_LOSS_PER_SLEEP_L, BALCONY_GROW_WILT_NIGHTS_WITHOUT_WATER,
    BALCONY_GROW_HARVEST_FOOD_BONUS_FERTILIZER_THRESHOLD,
    BALCONY_GROW_HARVEST_FOOD_BONUS_LIGHT_THRESHOLD,
    BALCONY_GROW_HARVEST_FOOD_BONUS_WATER_FULL_THRESHOLD,
    BALCONY_GROW_HARVEST_FOOD_BONUS_WATER_OK_THRESHOLD,
    BALCONY_GROW_HARVEST_SEED_BONUS_FERTILIZER_THRESHOLD,
    BALCONY_GROW_HARVEST_SEED_BONUS_LIGHT_THRESHOLD,
    BALCONY_GROW_HARVEST_SEED_BONUS_WATER_FULL_THRESHOLD,
    BALCONY_GROW_HARVEST_SEED_BONUS_WATER_OK_THRESHOLD, PHASE_EMPTY, PHASE_GROWING,
    plant_row_key,
};

#[test]
fn tray_builtin_ids_count_and_known() {
    assert_eq!(BALCONY_GROW_TRAY_BUILTIN_IDS.len(), 8);
    for id in BALCONY_GROW_TRAY_BUILTIN_IDS {
        assert!(is_known_tray_id(id));
    }
    assert!(is_known_tray_id("decor:123"));
    assert!(!is_known_tray_id("decor:nope"));
}

#[test]
fn grow_speed_modifier_stacks_bonuses() {
    let m = grow_speed_modifier(true, true, 1.0);
    assert!((m - 1.55).abs() < 0.001);
    let base = grow_speed_modifier(false, false, 0.0);
    assert!((base - 1.0).abs() < 0.001);
}

#[test]
fn tray_water_loss_is_sleep_only_and_balanced() {
    use super::BALCONY_WATER_PATCH_DURATION_SECS;

    assert_eq!(BALCONY_GROW_TRAY_WATER_LOSS_PER_SLEEP_L, 0.5);
    assert_eq!(BALCONY_GROW_WILT_NIGHTS_WITHOUT_WATER, 2);
    assert!((tray_water_after_sleep_nights(BALCONY_GROW_TRAY_MAX_WATER_L, 1) - 1.5).abs() < 0.001);
    assert!((tray_water_after_sleep_nights(1.5, 1) - 1.0).abs() < 0.001);
    assert!((tray_water_after_sleep_nights(0.4, 1)).abs() < 0.001);
    assert_eq!(tray_dry_nights_after_sleep(BALCONY_GROW_TRAY_MAX_WATER_L, 0, 1), 0);
    assert_eq!(tray_dry_nights_after_sleep(0.4, 0, 1), 1);
    assert_eq!(tray_dry_nights_after_sleep(0.0, 1, 1), 2);
    assert_eq!(BALCONY_WATER_PATCH_DURATION_SECS, 45);
}

#[test]
fn session_baseline_maps_five_catalog_days_to_fifteen_minutes() {
    use super::{
        BALCONY_GROW_BASELINE_DURATION_SECS, BALCONY_GROW_REFERENCE_DAYS, BALCONY_GAME_DAY_SECS,
    };
    assert_eq!(BALCONY_GROW_BASELINE_DURATION_SECS, 900);
    assert_eq!(BALCONY_GROW_REFERENCE_DAYS, 5);
    assert_eq!(BALCONY_GAME_DAY_SECS, 180);
}

#[test]
fn harvest_seed_base_is_always_one() {
    use super::BALCONY_GROW_HARVEST_SEED_BASE;
    assert_eq!(BALCONY_GROW_HARVEST_SEED_BASE, 1);
}

#[test]
fn harvest_food_base_is_always_one() {
    use super::BALCONY_GROW_HARVEST_FOOD_BASE;
    assert_eq!(BALCONY_GROW_HARVEST_FOOD_BASE, 1);
}

#[test]
fn target_days_shrink_when_substrate_applied_overnight() {
    let without = grow_speed_modifier(true, false, 1.0);
    let with_fert = grow_speed_modifier(true, true, 1.0);
    let adjusted = target_days_after_fertilizer(1, 5, without, with_fert);
    assert!(adjusted < 5);
    assert!(adjusted > 1);
    assert_eq!(
        target_days_after_fertilizer(5, 5, without, with_fert),
        5
    );
}

#[test]
fn apply_substrate_to_plants_marks_fed_and_recomputes_target_days() {
    let sender = Identity::from_byte_array([0u8; 32]);
    let plant = BalconyGrowPlant {
        row_key: plant_row_key("unit", "tray", 0),
        unit_key: "unit".into(),
        tray_id: "tray".into(),
        slot_index: 0,
        crop_def_id: "seed".into(),
        planted_at_micros: 0,
        mature_at_micros: 0,
        phase: PHASE_GROWING,
        owner: sender,
        target_days: 10,
        days_grown: 9,
        substrate_fed_overnight: 0,
    };

    let before_target = plant.target_days;

    let without = grow_speed_modifier(true, false, 1.0);
    let with_fert = grow_speed_modifier(true, true, 1.0);

    let mut v = vec![plant];
    apply_substrate_to_plants(&mut v, without, with_fert);
    let plant = v.pop().expect("one plant");

    assert_eq!(plant.substrate_fed_overnight, 1);
    assert!(
        plant.target_days <= before_target && plant.days_grown <= plant.target_days,
        "substrate pass should revise schedule without extending past maturity"
    );
}

#[test]
fn apply_substrate_to_plants_skips_empty_and_already_fed() {
    let sender = Identity::from_byte_array([0u8; 32]);
    let mk = |slot: u8, phase: u8, fed: u8| BalconyGrowPlant {
        row_key: plant_row_key("unit", "tray", slot),
        unit_key: "unit".into(),
        tray_id: "tray".into(),
        slot_index: slot,
        crop_def_id: "seed".into(),
        planted_at_micros: 0,
        mature_at_micros: 0,
        phase,
        owner: sender,
        target_days: 5,
        days_grown: 1,
        substrate_fed_overnight: fed,
    };

    let empty = mk(4, PHASE_EMPTY, 0);
    let fed = mk(5, PHASE_GROWING, 1);
    let empty_before = empty.target_days;
    let fed_before = fed.target_days;

    let without = grow_speed_modifier(false, false, 0.0);
    let with_fert = grow_speed_modifier(false, true, 0.0);

    let mut plants = vec![empty, fed];
    apply_substrate_to_plants(&mut plants, without, with_fert);
    assert_eq!(plants[0].target_days, empty_before);
    assert_eq!(plants[1].target_days, fed_before);
}

#[test]
fn harvest_bonus_rolls_stack_for_well_tended_crops() {
    let care = HarvestCareContext {
        lights_on: true,
        substrate_fed_overnight: true,
        water_liters: 2.0,
    };
    let roll_base = 42;
    let seed_bonuses = harvest_bonus_count(
        care,
        roll_base,
        0,
        BALCONY_GROW_HARVEST_SEED_BONUS_LIGHT_THRESHOLD,
        BALCONY_GROW_HARVEST_SEED_BONUS_FERTILIZER_THRESHOLD,
        BALCONY_GROW_HARVEST_SEED_BONUS_WATER_OK_THRESHOLD,
        BALCONY_GROW_HARVEST_SEED_BONUS_WATER_FULL_THRESHOLD,
    );
    let food_bonuses = harvest_bonus_count(
        care,
        roll_base,
        100,
        BALCONY_GROW_HARVEST_FOOD_BONUS_LIGHT_THRESHOLD,
        BALCONY_GROW_HARVEST_FOOD_BONUS_FERTILIZER_THRESHOLD,
        BALCONY_GROW_HARVEST_FOOD_BONUS_WATER_OK_THRESHOLD,
        BALCONY_GROW_HARVEST_FOOD_BONUS_WATER_FULL_THRESHOLD,
    );
    assert!(seed_bonuses <= 4);
    assert!(food_bonuses <= 4);
    assert_eq!(harvest_seed_count(care, roll_base), 1 + seed_bonuses);
    assert_eq!(harvest_food_count(care, roll_base), 1 + food_bonuses);
}
