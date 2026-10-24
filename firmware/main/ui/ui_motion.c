#include "ui_motion.h"

#include "ui_tokens.generated.h"

#ifdef MONITOR_REDUCED_MOTION
static bool reduced_motion = true;
#else
static bool reduced_motion;
#endif

bool ui_motion_is_reduced(void)
{
    return reduced_motion;
}

void ui_motion_set_reduced(bool reduced)
{
#ifndef MONITOR_REDUCED_MOTION
    reduced_motion = reduced;
#else
    (void)reduced;
#endif
}

static void enter_exec(void *object, int32_t y)
{
    lv_obj_set_style_translate_y(object, (lv_coord_t)y, 0);
}

void ui_motion_enter(lv_obj_t *object)
{
    lv_anim_del(object, enter_exec);
    lv_obj_set_style_translate_y(object, 0, 0);
    if (reduced_motion) return;
    lv_anim_t animation;
    lv_anim_init(&animation);
    lv_anim_set_var(&animation, object);
    lv_anim_set_exec_cb(&animation, enter_exec);
    lv_anim_set_values(&animation, 6, 0);
    lv_anim_set_time(&animation, UI_MOTION_NAVIGATION_MS);
    lv_anim_set_path_cb(&animation, lv_anim_path_ease_out);
    lv_anim_start(&animation);
}

static void bg_opa_exec(void *object, int32_t value)
{
    lv_obj_set_style_bg_opa((lv_obj_t *)object, (lv_opa_t)value, 0);
}

static void print_exec(void *object, int32_t x)
{
    lv_obj_set_style_translate_x(object,(lv_coord_t)x,0);
}

static void ambient_exec(void *object, int32_t x)
{
    if (lv_obj_get_style_translate_x(object, 0) != x)
        lv_obj_set_style_translate_x(object, (lv_coord_t)x, 0);
}

void ui_motion_print(lv_obj_t *object)
{
    lv_obj_set_style_translate_x(object,0,0);
    if(reduced_motion) return;
    lv_anim_t animation;
    lv_anim_init(&animation);
    lv_anim_set_var(&animation,object);
    lv_anim_set_exec_cb(&animation,print_exec);
    lv_anim_set_values(&animation,-12,0);
    lv_anim_set_time(&animation,180);
    lv_anim_set_path_cb(&animation,lv_anim_path_ease_out);
    lv_anim_start(&animation);
    /* Continue with a clipped print drift after the quick entry finishes. */
    lv_anim_t ambient;
    lv_anim_init(&ambient);
    lv_anim_set_var(&ambient, object);
    lv_anim_set_exec_cb(&ambient, ambient_exec);
    lv_anim_set_values(&ambient, 0, -48);
    lv_anim_set_time(&ambient, 4000);
    lv_anim_set_playback_time(&ambient, 4000);
    lv_anim_set_delay(&ambient, 600);
    lv_anim_set_early_apply(&ambient, false);
    lv_anim_set_repeat_count(&ambient, LV_ANIM_REPEAT_INFINITE);
    lv_anim_start(&ambient);
}

static void arc_exec(void *object, int32_t value)
{
    lv_arc_set_value(object, (int16_t)value);
}

void ui_motion_set_arc(lv_obj_t *arc, int value, bool animate)
{
    if (arc == NULL) return;
    value = value < 0 ? 0 : value > 100 ? 100 : value;
    lv_anim_del(arc, arc_exec);
    if (reduced_motion || !animate) { lv_arc_set_value(arc, (int16_t)value); return; }
    lv_anim_t animation;
    lv_anim_init(&animation);
    lv_anim_set_var(&animation, arc);
    lv_anim_set_exec_cb(&animation, arc_exec);
    lv_anim_set_values(&animation, lv_arc_get_value(arc), value);
    lv_anim_set_time(&animation, UI_MOTION_METRIC_MS);
    lv_anim_set_path_cb(&animation, lv_anim_path_ease_out);
    lv_anim_start(&animation);
}

static void bar_glint_exec(void *object, int32_t phase)
{
    lv_obj_t *bar = object;
    phase = (phase/2)*2;
    if ((int32_t)(intptr_t)lv_obj_get_user_data(bar) == phase) return;
    lv_obj_set_user_data(bar, (void *)(intptr_t)phase);
    if (lv_bar_get_value(bar) > 0) lv_obj_invalidate(bar);
}

static void bar_glint_draw(lv_event_t *event)
{
    lv_obj_t *bar = lv_event_get_target(event);
    lv_obj_draw_part_dsc_t *part = lv_event_get_draw_part_dsc(event);
    if (part->part != LV_PART_INDICATOR || part->draw_area == NULL ||
        ui_motion_is_reduced() || lv_anim_get(bar, bar_glint_exec) == NULL ||
        lv_bar_get_value(bar) <= 0) return;
    lv_area_t area = *part->draw_area;
    area.x1 += 2; area.x2 -= 2; area.y1 += 1; area.y2 -= 1;
    int width = lv_area_get_width(&area);
    if (width < 4 || area.y2 < area.y1) return;
    int phase = (int)(intptr_t)lv_obj_get_user_data(bar);
    int lead = area.x1 + (width+14)*phase/63 - 14;
    lv_draw_rect_dsc_t draw;
    lv_draw_rect_dsc_init(&draw);
    draw.bg_color = lv_color_white();
    draw.bg_opa = LV_OPA_60;
    draw.radius = 1;
    lv_area_t shine = {LV_MAX(area.x1,lead),area.y1,LV_MIN(area.x2,lead+13),area.y2};
    if (shine.x1 <= shine.x2) lv_draw_rect(part->draw_ctx, &draw, &shine);
}

void ui_motion_set_bar_activity(lv_obj_t *bar, bool enabled)
{
    if (bar == NULL) return;
    bool running = lv_anim_get(bar, bar_glint_exec) != NULL;
    if (!enabled || reduced_motion) {
        if (running) {
            lv_anim_del(bar, bar_glint_exec);
            lv_obj_invalidate(bar);
        }
        return;
    }
    if (running) return;
    lv_anim_t glint;
    lv_anim_init(&glint);
    lv_anim_set_var(&glint, bar);
    lv_anim_set_exec_cb(&glint, bar_glint_exec);
    lv_anim_set_values(&glint, 0, 63);
    lv_anim_set_time(&glint, 2200);
    lv_anim_set_repeat_count(&glint, LV_ANIM_REPEAT_INFINITE);
    lv_anim_start(&glint);
}

void ui_motion_prepare_bar(lv_obj_t *bar)
{
    lv_obj_set_style_anim_time(bar, UI_MOTION_METRIC_MS, LV_PART_MAIN);
    lv_obj_add_event_cb(bar, bar_glint_draw, LV_EVENT_DRAW_PART_END, NULL);
}

void ui_motion_set_bg_opa(lv_obj_t *object, lv_opa_t target, uint32_t duration_ms)
{
    if (object == NULL) return;
    if (reduced_motion) duration_ms = 0;
    if (duration_ms == 0) {
        lv_anim_del(object, bg_opa_exec);
        lv_obj_set_style_bg_opa(object, target, 0);
        return;
    }
    /* One animation per target property: a new page change continues from the
     * current opacity instead of stacking another animation on the button. */
    lv_anim_del(object, bg_opa_exec);
    lv_anim_t animation;
    lv_anim_init(&animation);
    lv_anim_set_var(&animation, object);
    lv_anim_set_exec_cb(&animation, bg_opa_exec);
    lv_anim_set_values(&animation, lv_obj_get_style_bg_opa(object, 0), (int32_t)target);
    lv_anim_set_time(&animation, duration_ms);
    lv_anim_set_path_cb(&animation, lv_anim_path_ease_out);
    lv_anim_start(&animation);
}

void ui_motion_set_bar(lv_obj_t *bar, int value, bool animate)
{
    if (bar == NULL) return;
    if (value < 0) value = 0;
    if (value > 100) value = 100;
    if (reduced_motion) animate = false;
    lv_bar_set_value(bar, value, animate ? LV_ANIM_ON : LV_ANIM_OFF);
}

void ui_motion_cancel(lv_obj_t *object)
{
    if (object != NULL) lv_anim_del(object, NULL);
}
