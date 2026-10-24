#include "ui_shell.h"

#include <inttypes.h>
#include <math.h>
#include <stdio.h>
#include <string.h>

#include "lvgl.h"
#include "ui_layouts.generated.h"
#include "ui_motion.h"
#include "ui_router.h"
#include "ui_text_zh.h"
#include "ui_tokens.generated.h"
#include "ui_art.h"

LV_FONT_DECLARE(ui_font_zh_16);
LV_FONT_DECLARE(ui_font_numeric_28);
LV_FONT_DECLARE(ui_font_numeric_40);
LV_FONT_DECLARE(ui_font_numeric_56);
LV_FONT_DECLARE(ui_font_poster_84);
LV_FONT_DECLARE(ui_font_poster_112);

#define FONT_LABEL (&ui_font_zh_16)
#define FONT_TAG (&lv_font_montserrat_14)
#define FONT_METRIC (&ui_font_numeric_28)
#define FONT_METRIC_LARGE (&ui_font_numeric_40)
#define FONT_COUNTDOWN (&font_countdown)
#define FONT_COUNTDOWN_COMPACT (&font_countdown_compact)

/* This renderer has its own optical sizes (28/40/56). Shared rectangles remain
 * unchanged; the browser is a schematic preview, not an LVGL font emulator. */

typedef struct {
    lv_obj_t *value;
    lv_obj_t *bar;
    lv_obj_t *state;
    lv_obj_t *dial;
    lv_obj_t *trend;
    uint32_t trend_revision;
    lv_area_t readout;
    const lv_font_t *readout_font;
    const lv_font_t *tight_font;
} metric_view_t;

#define TREND_POINTS 24
typedef struct {
    lv_coord_t points[TREND_POINTS];
    int64_t sample_ms;
    uint32_t revision;
    bool initialized;
    bool gap;
} metric_history_t;

static metric_history_t cpu_history;
static metric_history_t memory_history;

/* Actual distinct samples, collected even while another page is visible.
 * An interrupted source produces a gap rather than an invented waveform. */
static void record_history(metric_history_t *history, const ui_metric_model_t *metric,
                           monitor_connection_state_t connection)
{
    if (!history->initialized) {
        for (int i = 0; i < TREND_POINTS; ++i) history->points[i] = LV_CHART_POINT_NONE;
        history->sample_ms = -1;
        history->initialized = true;
        history->gap = true;
    }
    bool valid = connection == MONITOR_CONNECTION_ONLINE &&
                 metric->has_value && metric->state == UI_DATA_FRESH;
    if (valid && history->sample_ms == metric->last_update_ms) return;
    if (!valid && history->gap) return;
    memmove(history->points, history->points + 1,
            (TREND_POINTS - 1) * sizeof(history->points[0]));
    history->points[TREND_POINTS - 1] = valid ? (lv_coord_t)LV_MIN(metric->value, 100u)
                                             : LV_CHART_POINT_NONE;
    if (valid) history->sample_ms = metric->last_update_ms;
    history->gap = !valid;
    ++history->revision;
}

static lv_obj_t *screen;
static lv_obj_t *status_plate;
static lv_obj_t *status_dot;
static lv_obj_t *content;
static lv_obj_t *navigation;
static lv_obj_t *nav_buttons[3];
static lv_obj_t *nav_labels[3];
static lv_obj_t *nav_indicators[3];
static lv_font_t font_countdown;
static lv_font_t font_countdown_compact;
static lv_obj_t *countdown_value;
static lv_obj_t *countdown_unit;
static int countdown_ticket_width;
static lv_obj_t *countdown_time;
static lv_obj_t *countdown_state;
static lv_obj_t *connection_details;
static metric_view_t cpu_view;
static metric_view_t memory_view;
static ui_router_t router;
static ui_model_t latest_model;
static ui_model_t rendered_model;
static bool has_model;
static bool has_rendered_model;
static bool force_render;
static bool showing_connection_panel;
static bool countdown_uses_compact_font;
static lv_point_t swipe_origin;
static bool swipe_origin_valid;
static bool status_long_pressed;
static monitor_display_config_t active_config = {
    .revision = 0,
    .title = UI_TEXT_DEFAULT_TITLE,
    .page = MONITOR_PAGE_OVERVIEW,
    .background_color = UI_COLOR_BACKGROUND,
    .card_color = UI_COLOR_SURFACE,
    .accent_color = UI_COLOR_ACCENT,
    .data_text_color = UI_COLOR_TEXT_PRIMARY,
    .show_cpu = true,
    .show_memory = true,
    .show_exam = true,
};

static void rebuild_content(void);
static void update_dynamic_content(void);

static lv_color_t ticket_ink(void)
{
    uint32_t color = active_config.data_text_color;
    float luminance = 0.0f;
    const float weights[] = {0.2126f,0.7152f,0.0722f};
    for(int index=0;index<3;++index) {
        float channel = ((color >> (16-index*8)) & 255u)/255.0f;
        channel = channel <= 0.04045f ? channel/12.92f : powf((channel+0.055f)/1.055f,2.4f);
        luminance += channel*weights[index];
    }
    return lv_color_hex(luminance >= 0.179f ? 0x08090Au : UI_COLOR_TEXT_PRIMARY);
}

static lv_obj_t *make_label(lv_obj_t *parent, const char *text, int x, int y,
                            const lv_font_t *font, lv_color_t color)
{
    lv_obj_t *label = lv_label_create(parent);
    lv_label_set_text(label, text);
    lv_obj_set_pos(label, x, y);
    lv_obj_set_style_text_font(label, font, 0);
    lv_obj_set_style_text_color(label, color, 0);
    lv_obj_add_flag(label, LV_OBJ_FLAG_EVENT_BUBBLE | LV_OBJ_FLAG_GESTURE_BUBBLE);
    return label;
}

/* Single-line readouts are aligned by visible glyphs, not the nominal font
 * size or line box. In particular, the poster face has an 87px line box but
 * only 63-65px tall digits. Keep this consistent with LVGL's letter renderer. */
static lv_area_t label_ink_bounds(lv_obj_t *label)
{
    const lv_font_t *font = lv_obj_get_style_text_font(label, LV_PART_MAIN);
    const char *text = lv_label_get_text(label);
    lv_area_t ink = {0, 0, 0, 0};
    int pen = 0;
    bool first = true;
    uint32_t offset = 0;
    while (text[offset] != '\0') {
        uint32_t letter = _lv_txt_encoded_next(text, &offset);
        uint32_t next_offset = offset;
        uint32_t next = _lv_txt_encoded_next(text, &next_offset);
        lv_font_glyph_dsc_t glyph;
        if (!lv_font_get_glyph_dsc(font, &glyph, letter, next)) continue;
        if (glyph.box_w && glyph.box_h) {
            int left = pen + glyph.ofs_x;
            int top = font->line_height - font->base_line - glyph.box_h - glyph.ofs_y;
            int right = left + glyph.box_w - 1;
            int bottom = top + glyph.box_h - 1;
            if (first) ink = (lv_area_t){left, top, right, bottom};
            else {
                ink.x1 = LV_MIN(ink.x1, left); ink.x2 = LV_MAX(ink.x2, right);
                ink.y1 = LV_MIN(ink.y1, top); ink.y2 = LV_MAX(ink.y2, bottom);
            }
            first = false;
        }
        pen += glyph.adv_w + lv_obj_get_style_text_letter_space(label, LV_PART_MAIN);
    }
    return ink;
}

static void align_readout(lv_obj_t *label, lv_area_t region, bool centered)
{
    lv_area_t ink = label_ink_bounds(label);
    int x = region.x1 + (centered ? (lv_area_get_width(&region)-lv_area_get_width(&ink))/2 : 0);
    int y = region.y1 + (lv_area_get_height(&region)-lv_area_get_height(&ink))/2;
    lv_obj_set_pos(label, x-ink.x1, y-ink.y1);
}

static void align_countdown_readout(bool has_value)
{
    lv_area_t digits = label_ink_bounds(countdown_value);
    lv_area_t unit = label_ink_bounds(countdown_unit);
    const int gap = 8;
    int group_width = lv_area_get_width(&digits) + (has_value ? gap+lv_area_get_width(&unit) : 0);
    int left = (countdown_ticket_width-group_width)/2;
    const int band_top = 52;
    const int band_height = UI_LAYOUT_CONTENT.height-132;
    int top = band_top + (band_height-lv_area_get_height(&digits))/2;
    lv_obj_set_pos(countdown_value, left-digits.x1, top-digits.y1);
    if (has_value) {
        lv_obj_clear_flag(countdown_unit, LV_OBJ_FLAG_HIDDEN);
        lv_obj_set_pos(countdown_unit, left+lv_area_get_width(&digits)+gap-unit.x1,
                       top+lv_area_get_height(&digits)-lv_area_get_height(&unit)-unit.y1);
    } else lv_obj_add_flag(countdown_unit, LV_OBJ_FLAG_HIDDEN);
}

static lv_obj_t *make_decor(lv_obj_t *parent, int x, int y, int width, int height,
                            uint32_t color, int radius)
{
    lv_obj_t *decor = lv_obj_create(parent);
    lv_obj_set_pos(decor, x, y);
    lv_obj_set_size(decor, width, height);
    lv_obj_set_style_bg_color(decor, lv_color_hex(color), 0);
    lv_obj_set_style_border_width(decor, 0, 0);
    lv_obj_set_style_radius(decor, radius, 0);
    lv_obj_set_style_pad_all(decor, 0, 0);
    lv_obj_clear_flag(decor, LV_OBJ_FLAG_SCROLLABLE | LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_flag(decor, LV_OBJ_FLAG_EVENT_BUBBLE | LV_OBJ_FLAG_GESTURE_BUBBLE);
    return decor;
}

static lv_obj_t *make_card(int x, int y, int width, int height)
{
    lv_obj_t *card = lv_obj_create(content);
    lv_obj_set_pos(card, x, y);
    lv_obj_set_size(card, width, height);
    lv_obj_set_style_bg_color(card, lv_color_hex(active_config.card_color), 0);
    lv_obj_set_style_bg_grad_color(card, lv_color_hex(active_config.background_color), 0);
    lv_obj_set_style_bg_grad_dir(card, LV_GRAD_DIR_NONE, 0);
    lv_obj_set_style_border_color(card, lv_color_hex(0x050506), 0);
    lv_obj_set_style_border_width(card, 3, 0);
    lv_obj_set_style_border_opa(card, LV_OPA_COVER, 0);
    lv_obj_set_style_radius(card, 16, 0);
    lv_obj_set_style_shadow_color(card, lv_color_hex(0x050506), 0);
    lv_obj_set_style_shadow_width(card, 0, 0);
    lv_obj_set_style_shadow_opa(card, LV_OPA_60, 0);
    lv_obj_set_style_pad_all(card, 0, 0);
    lv_obj_clear_flag(card, LV_OBJ_FLAG_SCROLLABLE);
    /* Both flags are needed: the card is the pressed object, so the gesture and
     * the press point have to reach the content area to be interpreted there. */
    lv_obj_add_flag(card, LV_OBJ_FLAG_GESTURE_BUBBLE);
    lv_obj_add_flag(card, LV_OBJ_FLAG_EVENT_BUBBLE);
    lv_obj_set_style_outline_color(card, lv_color_hex(active_config.data_text_color), LV_STATE_PRESSED);
    lv_obj_set_style_outline_width(card, 2, LV_STATE_PRESSED);
    lv_obj_set_style_translate_y(card, 1, LV_STATE_PRESSED);
    lv_obj_t *lip = make_decor(card, 12, 5, width - 24, 1, UI_COLOR_TEXT_PRIMARY, 0);
    lv_obj_set_style_bg_opa(lip, LV_OPA_20, 0);
    return card;
}

static lv_obj_t *make_ticket(int x, int y, int width, int height)
{
    lv_obj_t *card = make_card(x,y,width,height);
    lv_obj_set_style_bg_opa(card,LV_OPA_TRANSP,0);
    lv_obj_set_style_border_width(card,0,0);
    lv_obj_clean(card);
    return card;
}

static void make_scene_print(void)
{
    static const char *words[] = {"MONITOR", "SYSTEM", "STUDY"};
    lv_obj_t *word = make_label(content,words[router.active_page],
                                router.active_page == MONITOR_PAGE_STUDY ? 284 : 110,-42,
                                &ui_font_poster_84,lv_color_hex(active_config.data_text_color));
    lv_obj_set_style_text_opa(word,LV_OPA_40,0);
    lv_obj_set_style_text_letter_space(word,-3,0);
    ui_motion_print(word);
    for(int i=0;i<23;++i) {
        lv_obj_t *hole = make_decor(content,i*20,UI_LAYOUT_CONTENT.height-9,8,5,UI_COLOR_TEXT_SECONDARY,1);
        lv_obj_set_style_bg_opa(hole,LV_OPA_30,0);
    }
}

static void page_event(lv_event_t *event)
{
    monitor_page_t page = (monitor_page_t)(intptr_t)lv_event_get_user_data(event);
    if (ui_router_set_page(&router, page)) rebuild_content();
}

static metric_view_t make_metric_card(int x, int y, int width, int height,
                                      const char *title, monitor_page_t target_page)
{
    lv_obj_t *card = make_card(x, y, width, height);
    lv_obj_set_style_radius(card,12,0);
    uint32_t tab_color = active_config.data_text_color;
    make_decor(card, 16, 0, width > 220 ? 62 : 44, 4, tab_color, 2);
    lv_obj_add_flag(card, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_event_cb(card, page_event, LV_EVENT_CLICKED, (void *)(intptr_t)target_page);
    make_label(card, title, 16, 13, FONT_LABEL,
               lv_color_hex(UI_COLOR_TEXT_SECONDARY));
    lv_obj_t *tag = make_label(card, strcmp(title, "CPU") == 0 ? "SYS-01" : "MEM-02",
                               width - 85, 13, FONT_TAG, lv_color_hex(UI_COLOR_TEXT_SECONDARY));
    lv_obj_set_width(tag, 68);
    lv_obj_set_style_text_align(tag, LV_TEXT_ALIGN_RIGHT, 0);
    const bool large = height >= 150;
    const int dial_size = LV_MIN(width-30,height-98);
    const int dial_center = height/2-16;
    metric_view_t view = {
        .value = NULL,
        .bar = NULL,
        .state = NULL,
        .dial = NULL,
        .readout = large ? (lv_area_t){0, dial_center-32, width-7, dial_center+31}
                         : (lv_area_t){16, 40, width-23, height-28},
        .readout_font = large && dial_size >= 160 ? &ui_font_numeric_56 : FONT_METRIC_LARGE,
        .tight_font = dial_size >= 160 ? FONT_METRIC_LARGE : FONT_METRIC,
    };
    if(height >= 150) {
        view.dial = lv_arc_create(card);
        lv_obj_set_size(view.dial,dial_size,dial_size);
        lv_obj_set_pos(view.dial,(width-6-dial_size)/2,dial_center-dial_size/2);
        lv_arc_set_bg_angles(view.dial,135,405);
        lv_arc_set_range(view.dial,0,100);
        lv_obj_set_style_arc_color(view.dial,lv_color_hex(0x08090A),LV_PART_MAIN);
        lv_obj_set_style_arc_width(view.dial,9,LV_PART_MAIN);
        lv_obj_set_style_arc_color(view.dial,lv_color_hex(tab_color),LV_PART_INDICATOR);
        lv_obj_set_style_arc_width(view.dial,9,LV_PART_INDICATOR);
        lv_obj_set_style_bg_opa(view.dial,LV_OPA_TRANSP,LV_PART_KNOB);
        lv_obj_set_style_pad_all(view.dial,0,LV_PART_KNOB);
        lv_obj_clear_flag(view.dial,LV_OBJ_FLAG_CLICKABLE | LV_OBJ_FLAG_SCROLLABLE);
        lv_obj_add_flag(view.dial,LV_OBJ_FLAG_EVENT_BUBBLE | LV_OBJ_FLAG_GESTURE_BUBBLE);
        make_decor(card,(width-6)/2-2,dial_center-dial_size/2+9,4,8,tab_color,2);
    }
    view.value = make_label(card, "--", 0, 0,
                            view.readout_font,
                            lv_color_hex(active_config.data_text_color));
    align_readout(view.value, view.readout, height >= 150);
    view.bar = lv_bar_create(card);
    lv_obj_set_pos(view.bar, 16, height - 17);
    lv_obj_set_size(view.bar, width - 32, 6);
    lv_bar_set_range(view.bar, 0, 100);
    lv_obj_set_style_bg_color(view.bar, lv_color_hex(0x08080A), LV_PART_MAIN);
    lv_obj_set_style_radius(view.bar, 3, LV_PART_MAIN);
    lv_obj_set_style_radius(view.bar, 3, LV_PART_INDICATOR);
    lv_obj_set_style_bg_color(view.bar, lv_color_hex(active_config.data_text_color), LV_PART_INDICATOR);
    ui_motion_prepare_bar(view.bar);
    if (height >= 150) {
        view.state = make_label(card, UI_TEXT_WAITING_FOR_DATA, 0, height - 65,
                                FONT_LABEL,
                                lv_color_hex(UI_COLOR_TEXT_SECONDARY));
        lv_obj_set_width(view.state,width-6);
        lv_obj_set_style_text_align(view.state,LV_TEXT_ALIGN_CENTER,0);
    }
    if (large) {
        /* A small recessed trace replaces the redundant bottom bar. */
        lv_obj_add_flag(view.bar, LV_OBJ_FLAG_HIDDEN);
        view.trend = lv_chart_create(card);
        lv_obj_set_pos(view.trend, 14, height - 40);
        lv_obj_set_size(view.trend, width - 34, 26);
        lv_obj_set_style_bg_color(view.trend, lv_color_hex(0x08090A), 0);
        lv_obj_set_style_bg_opa(view.trend, LV_OPA_60, 0);
        lv_obj_set_style_border_width(view.trend, 0, 0);
        lv_obj_set_style_pad_all(view.trend, 2, 0);
        lv_obj_set_style_radius(view.trend, 4, 0);
        lv_obj_set_style_line_width(view.trend, 2, LV_PART_ITEMS);
        lv_obj_set_style_size(view.trend, 0, LV_PART_INDICATOR);
        lv_obj_set_style_line_opa(view.trend, LV_OPA_20, LV_PART_MAIN);
        lv_chart_set_type(view.trend, LV_CHART_TYPE_LINE);
        lv_chart_set_point_count(view.trend, TREND_POINTS);
        lv_chart_set_range(view.trend, LV_CHART_AXIS_PRIMARY_Y, 0, 100);
        lv_chart_set_div_line_count(view.trend, 2, 0);
        metric_history_t *history = strcmp(title, "CPU") == 0 ? &cpu_history : &memory_history;
        if (!history->initialized) {
            for (int i = 0; i < TREND_POINTS; ++i) history->points[i] = LV_CHART_POINT_NONE;
        }
        lv_chart_series_t *series = lv_chart_add_series(view.trend,
            lv_color_hex(active_config.data_text_color), LV_CHART_AXIS_PRIMARY_Y);
        lv_chart_set_ext_y_array(view.trend, series, history->points);
        lv_obj_clear_flag(view.trend, LV_OBJ_FLAG_CLICKABLE | LV_OBJ_FLAG_SCROLLABLE);
        lv_obj_add_flag(view.trend, LV_OBJ_FLAG_EVENT_BUBBLE | LV_OBJ_FLAG_GESTURE_BUBBLE);
        view.trend_revision = history->revision;
    }
    return view;
}

static void make_countdown_card(int x, int y, int width, int height)
{
    lv_obj_t *card = make_ticket(x,y,width,height);
    const int ticket_width = width > 300 ? 288 : width;
    countdown_ticket_width = ticket_width;
    ui_art_create(card,UI_ART_TICKET,0,0,ticket_width,height,active_config.data_text_color);
    lv_obj_t *heading_plate = make_decor(card,18,15,116,26,0x08090A,13);
    make_label(heading_plate,UI_TEXT_EXAM_COUNTDOWN,10,0,FONT_LABEL,
                lv_color_hex(UI_COLOR_TEXT_PRIMARY));
    lv_obj_add_flag(card, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_event_cb(card, page_event, LV_EVENT_CLICKED,
                        (void *)(intptr_t)MONITOR_PAGE_STUDY);
    lv_obj_t *tag = make_label(card, "T-DAY / 01", ticket_width-107,20,
                               FONT_TAG,ticket_ink());
    lv_obj_set_width(tag, 80);
    lv_obj_set_style_text_align(tag, LV_TEXT_ALIGN_RIGHT, 0);
    countdown_value = make_label(card, "--", 0, 0,
                                 FONT_COUNTDOWN,ticket_ink());
    countdown_unit = make_label(card, UI_TEXT_DAY, 0, 0, FONT_LABEL, ticket_ink());
    align_countdown_readout(false);
    make_decor(card,22,height-64,ticket_width-44,35,0x08090A,17);
    countdown_time = make_label(card, "--:--:--", 22, height - 57,
                                FONT_METRIC,
                                lv_color_hex(UI_COLOR_TEXT_PRIMARY));
    lv_obj_set_width(countdown_time,ticket_width-44);
    lv_obj_set_style_text_align(countdown_time, LV_TEXT_ALIGN_CENTER, 0);
    countdown_state = make_label(card, UI_TEXT_WAITING_FOR_DATA, 20, height - 32,
                                 FONT_LABEL,
                                 ticket_ink());
    lv_obj_set_width(countdown_state,ticket_width-40);
    lv_obj_set_style_text_align(countdown_state, LV_TEXT_ALIGN_CENTER, 0);
    if(width > 300) {
        const int cassette_y = (height-146)/2;
        ui_art_create(card,UI_ART_CASSETTE,300,cassette_y,156,146,active_config.data_text_color);
        make_label(card,"T-DAY / DM-01",313,cassette_y+10,FONT_TAG,ticket_ink());
        make_label(card,"COUNTDOWN",329,cassette_y+118,FONT_TAG,lv_color_hex(UI_COLOR_TEXT_SECONDARY));
    }
}

static void make_empty_state(const char *message)
{
    lv_obj_t *card = make_card(0, 0, UI_LAYOUT_CONTENT.width, UI_LAYOUT_CONTENT.height);
    make_decor(card, 14, 0, 72, 4, active_config.data_text_color, 2);
    lv_obj_t *label = make_label(card, message, 24, 70, FONT_LABEL,
                                 lv_color_hex(UI_COLOR_TEXT_SECONDARY));
    lv_obj_set_width(label, 400);
    lv_obj_set_style_text_align(label, LV_TEXT_ALIGN_CENTER, 0);
    lv_label_set_long_mode(label, LV_LABEL_LONG_WRAP);
}

static void build_system_cards(bool cpu, bool memory)
{
    if (cpu && memory) {
        cpu_view = make_metric_card(UI_LAYOUT_SYSTEM_CPU.x - UI_LAYOUT_CONTENT.x,
                                    UI_LAYOUT_SYSTEM_CPU.y - UI_LAYOUT_CONTENT.y,
                                    UI_LAYOUT_SYSTEM_CPU.width, UI_LAYOUT_SYSTEM_CPU.height,
                                    "CPU", MONITOR_PAGE_SYSTEM);
        memory_view = make_metric_card(UI_LAYOUT_SYSTEM_MEMORY.x - UI_LAYOUT_CONTENT.x,
                                       UI_LAYOUT_SYSTEM_MEMORY.y - UI_LAYOUT_CONTENT.y,
                                       UI_LAYOUT_SYSTEM_MEMORY.width, UI_LAYOUT_SYSTEM_MEMORY.height,
                                       UI_TEXT_MEMORY, MONITOR_PAGE_SYSTEM);
    } else if (cpu) {
        cpu_view = make_metric_card(0, 0, UI_LAYOUT_CONTENT.width, UI_LAYOUT_CONTENT.height,
                                    "CPU", MONITOR_PAGE_SYSTEM);
    } else if (memory) {
        memory_view = make_metric_card(0, 0, UI_LAYOUT_CONTENT.width, UI_LAYOUT_CONTENT.height,
                                       UI_TEXT_MEMORY, MONITOR_PAGE_SYSTEM);
    } else {
        make_empty_state(UI_TEXT_NO_SYSTEM_METRICS);
    }
}

static void build_overview(void)
{
    bool cpu = active_config.show_cpu;
    bool memory = active_config.show_memory;
    bool exam = active_config.show_exam;
    if (!exam) {
        build_system_cards(cpu, memory);
        return;
    }
    if (!cpu && !memory) {
        make_countdown_card(0, 0, UI_LAYOUT_CONTENT.width, UI_LAYOUT_CONTENT.height);
        return;
    }
    make_countdown_card(UI_LAYOUT_OVERVIEW_COUNTDOWN.x - UI_LAYOUT_CONTENT.x,
                        UI_LAYOUT_OVERVIEW_COUNTDOWN.y - UI_LAYOUT_CONTENT.y,
                        UI_LAYOUT_OVERVIEW_COUNTDOWN.width, UI_LAYOUT_OVERVIEW_COUNTDOWN.height);
    if (cpu && memory) {
        cpu_view = make_metric_card(UI_LAYOUT_OVERVIEW_CPU.x - UI_LAYOUT_CONTENT.x,
                                    UI_LAYOUT_OVERVIEW_CPU.y - UI_LAYOUT_CONTENT.y,
                                    UI_LAYOUT_OVERVIEW_CPU.width, UI_LAYOUT_OVERVIEW_CPU.height,
                                    "CPU", MONITOR_PAGE_SYSTEM);
        memory_view = make_metric_card(UI_LAYOUT_OVERVIEW_MEMORY.x - UI_LAYOUT_CONTENT.x,
                                       UI_LAYOUT_OVERVIEW_MEMORY.y - UI_LAYOUT_CONTENT.y,
                                       UI_LAYOUT_OVERVIEW_MEMORY.width, UI_LAYOUT_OVERVIEW_MEMORY.height,
                                       UI_TEXT_MEMORY, MONITOR_PAGE_SYSTEM);
    } else if (cpu) {
        cpu_view = make_metric_card(UI_LAYOUT_OVERVIEW_SINGLE_METRIC.x - UI_LAYOUT_CONTENT.x,
                                    UI_LAYOUT_OVERVIEW_SINGLE_METRIC.y - UI_LAYOUT_CONTENT.y,
                                    UI_LAYOUT_OVERVIEW_SINGLE_METRIC.width,
                                    UI_LAYOUT_OVERVIEW_SINGLE_METRIC.height,
                                    "CPU", MONITOR_PAGE_SYSTEM);
    } else {
        memory_view = make_metric_card(UI_LAYOUT_OVERVIEW_SINGLE_METRIC.x - UI_LAYOUT_CONTENT.x,
                                       UI_LAYOUT_OVERVIEW_SINGLE_METRIC.y - UI_LAYOUT_CONTENT.y,
                                       UI_LAYOUT_OVERVIEW_SINGLE_METRIC.width,
                                       UI_LAYOUT_OVERVIEW_SINGLE_METRIC.height,
                                       UI_TEXT_MEMORY, MONITOR_PAGE_SYSTEM);
    }
}

static void update_connection_details(void)
{
    if (connection_details == NULL) return;
    lv_label_set_text_fmt(connection_details, "%s\nCPU: %s / %s: %s\n%s: %s\n%s",
                          has_model ? ui_model_connection_text(latest_model.connection) : UI_TEXT_STARTING,
                          has_model ? ui_model_data_text(latest_model.cpu.state) : UI_TEXT_WAITING_FOR_DATA,
                          UI_TEXT_MEMORY,
                          has_model ? ui_model_data_text(latest_model.memory.state) : UI_TEXT_WAITING_FOR_DATA,
                          UI_TEXT_EXAM_COUNTDOWN,
                          has_model ? ui_model_data_text(latest_model.exam.state) : UI_TEXT_WAITING_FOR_DATA,
                          ui_motion_is_reduced() ? UI_TEXT_MOTION_REDUCED : UI_TEXT_MOTION_FULL);
}

static void build_connection_panel(void)
{
    lv_obj_t *card = make_card(0, 0, UI_LAYOUT_CONTENT.width, UI_LAYOUT_CONTENT.height);
    make_decor(card, 14, 0, 72, 4, active_config.data_text_color, 2);
    make_label(card, UI_TEXT_CONNECTION_DETAILS, 20, 18, FONT_LABEL,
               lv_color_hex(UI_COLOR_TEXT_PRIMARY));
    connection_details = make_label(card, "", 20, 51, FONT_LABEL,
                                   lv_color_hex(UI_COLOR_TEXT_SECONDARY));
    update_connection_details();
    make_label(card, UI_TEXT_MOTION_HINT, 20, 158, FONT_LABEL,
               lv_color_hex(active_config.data_text_color));
}

static void update_navigation(void)
{
    for (int index = 0; index < 3; ++index) {
        bool selected = router.active_page == (monitor_page_t)index;
        bool available = ui_router_page_available(&router, (monitor_page_t)index);
        /* A single dataText signal colour keeps user palettes consistent. */
        ui_motion_set_bg_opa(nav_buttons[index],
                             selected ? LV_OPA_COVER : LV_OPA_TRANSP,
                             selected ? UI_MOTION_NAVIGATION_MS : 0);
        lv_obj_set_style_bg_color(nav_buttons[index],
                                  lv_color_hex(active_config.data_text_color), 0);
        lv_obj_set_style_outline_color(nav_buttons[index], lv_color_hex(0x050506), 0);
        lv_obj_set_style_outline_width(nav_buttons[index], selected ? 2 : 0, 0);
        lv_obj_set_style_outline_pad(nav_buttons[index], 0, 0);
        lv_obj_set_style_text_color(nav_labels[index],
                                    selected ? ticket_ink() : lv_color_hex(UI_COLOR_TEXT_SECONDARY), 0);
        if (selected) lv_obj_clear_flag(nav_indicators[index], LV_OBJ_FLAG_HIDDEN);
        else lv_obj_add_flag(nav_indicators[index], LV_OBJ_FLAG_HIDDEN);
        if (available) lv_obj_clear_state(nav_buttons[index], LV_STATE_DISABLED);
        else lv_obj_add_state(nav_buttons[index], LV_STATE_DISABLED);
    }
}

static void rebuild_content(void)
{
    ui_motion_cancel(cpu_view.bar);
    ui_motion_cancel(memory_view.bar);
    lv_obj_clean(content);
    memset(&cpu_view, 0, sizeof(cpu_view));
    memset(&memory_view, 0, sizeof(memory_view));
    countdown_value = NULL;
    countdown_unit = NULL;
    countdown_time = NULL;
    countdown_state = NULL;
    connection_details = NULL;
    countdown_uses_compact_font = false;
    make_scene_print();

    if (showing_connection_panel) {
        build_connection_panel();
    } else if (router.active_page == MONITOR_PAGE_SYSTEM) {
        build_system_cards(active_config.show_cpu, active_config.show_memory);
    } else if (router.active_page == MONITOR_PAGE_STUDY) {
        if (active_config.show_exam) make_countdown_card(UI_LAYOUT_STUDY_COUNTDOWN.x - UI_LAYOUT_CONTENT.x,
                                                         UI_LAYOUT_STUDY_COUNTDOWN.y - UI_LAYOUT_CONTENT.y,
                                                         UI_LAYOUT_STUDY_COUNTDOWN.width,
                                                         UI_LAYOUT_STUDY_COUNTDOWN.height);
        else make_empty_state(UI_TEXT_COUNTDOWN_DISABLED);
    } else if (active_config.show_cpu || active_config.show_memory || active_config.show_exam) {
        build_overview();
    } else {
        make_empty_state(UI_TEXT_NO_VISIBLE_METRICS);
    }
    update_navigation();
    force_render = true;
    update_dynamic_content();
    ui_motion_enter(content);
}

/* The press origin is recorded on the content area so the horizontal/vertical
 * arbitration below works on the whole drag, not on a single input read. */
static void content_pressed(lv_event_t *event)
{
    (void)event;
    lv_indev_t *input = lv_indev_get_act();
    if (input == NULL) return;
    lv_indev_get_point(input, &swipe_origin);
    swipe_origin_valid = true;
}

static void gesture_event(lv_event_t *event)
{
    (void)event;
    if (showing_connection_panel) return;
    lv_indev_t *input = lv_indev_get_act();
    if (input == NULL) return;

    int dx = 0;
    int dy = 0;
    bool measured = swipe_origin_valid;
    if (measured) {
        lv_point_t current;
        lv_indev_get_point(input, &current);
        dx = (int)current.x - (int)swipe_origin.x;
        dy = (int)current.y - (int)swipe_origin.y;
    }
    swipe_origin_valid = false;

    /* A recognised gesture always consumes the press. Without this the release
     * after a gesture that cannot switch pages (first/last page, vertical drag)
     * is delivered to the card under the finger as LV_EVENT_CLICKED. */
    lv_indev_wait_release(input);
    if (!measured) return;

    int distance = dx < 0 ? -dx : dx;
    int drift = dy < 0 ? -dy : dy;
    if (distance < UI_GESTURE_LIMIT_PX) return;
    if (distance * UI_GESTURE_AXIS_RATIO_DEN < drift * UI_GESTURE_AXIS_RATIO_NUM) return;

    bool changed = dx < 0 ? ui_router_shift(&router, 1) : ui_router_shift(&router, -1);
    if (changed) rebuild_content();
}

static void connection_event(lv_event_t *event)
{
    if (lv_event_get_code(event) == LV_EVENT_PRESSED) {
        status_long_pressed = false;
        return;
    }
    if (lv_event_get_code(event) == LV_EVENT_LONG_PRESSED) {
        status_long_pressed = true;
        ui_motion_set_reduced(!ui_motion_is_reduced());
        showing_connection_panel = true;
        rebuild_content();
        return;
    }
    if (status_long_pressed) return;
    showing_connection_panel = !showing_connection_panel;
    rebuild_content();
}

static void nav_event(lv_event_t *event)
{
    monitor_page_t page = (monitor_page_t)(intptr_t)lv_event_get_user_data(event);
    bool was_connection_panel = showing_connection_panel;
    showing_connection_panel = false;
    if (ui_router_set_page(&router, page) || was_connection_panel) rebuild_content();
}

static void update_metric_view(metric_view_t *target, const metric_history_t *history,
                               const ui_metric_model_t *metric,
                               const ui_metric_model_t *previous, bool force)
{
    metric_view_t view = *target;
    if (view.value == NULL) return;
    if (view.dial == NULL)
        ui_motion_set_bar_activity(view.bar, latest_model.connection == MONITOR_CONNECTION_ONLINE &&
                                  metric->has_value && metric->state == UI_DATA_FRESH && metric->value > 0);
    if (view.trend != NULL && (force || view.trend_revision != history->revision)) {
        lv_chart_refresh(view.trend);
        target->trend_revision = history->revision;
    }
    if (force || metric->has_value != previous->has_value ||
        (metric->has_value && metric->value != previous->value)) {
        const lv_font_t *font = view.dial != NULL && metric->has_value && metric->value == 100
                               ? view.tight_font : view.readout_font;
        if (lv_obj_get_style_text_font(view.value, 0) != font)
            lv_obj_set_style_text_font(view.value, font, 0);
        if (metric->has_value) {
            lv_label_set_text_fmt(view.value, "%" PRIu32 "%%", metric->value);
            ui_motion_set_bar(view.bar, (int)metric->value, metric->state == UI_DATA_FRESH);
            ui_motion_set_arc(view.dial, (int)metric->value, metric->state == UI_DATA_FRESH);
        } else {
            lv_label_set_text(view.value, "--");
            ui_motion_set_bar(view.bar, 0, false);
            ui_motion_set_arc(view.dial, 0, false);
        }
        align_readout(view.value, view.readout, view.dial != NULL);
    }
    if (view.state != NULL && (force || metric->state != previous->state)) {
        lv_label_set_text(view.state, metric->state == UI_DATA_FRESH ? "TRACE / 24" : ui_model_data_text(metric->state));
    }
}

static void update_countdown(const ui_model_t *model, const ui_model_t *previous, bool force)
{
    if (countdown_value == NULL) return;
    bool value_changed = force || model->exam.has_value != previous->exam.has_value ||
                         (model->exam.has_value && model->exam.value != previous->exam.value);
    if (value_changed) {
        if (!model->exam.has_value) {
            lv_obj_set_style_text_font(countdown_value,FONT_COUNTDOWN,0);
            countdown_uses_compact_font = false;
            lv_label_set_text(countdown_value, "--");
            align_countdown_readout(false);
            lv_label_set_text(countdown_time, "--:--:--");
        } else {
            uint32_t seconds = model->exam.value;
            uint32_t days = seconds / 86400u;
            uint32_t remainder = seconds % 86400u;
            uint32_t hours = remainder / 3600u;
            uint32_t minutes = (remainder % 3600u) / 60u;
            uint32_t secs = remainder % 60u;
            /* Avoid changing the font every second; reserve the compact face
             * for 4/5-digit day strings, including the 9999+ overflow marker. */
            bool compact = days > 999u;
            if (countdown_uses_compact_font != compact) {
                lv_obj_set_style_text_font(countdown_value,
                                           compact ? FONT_COUNTDOWN_COMPACT : FONT_COUNTDOWN, 0);
                countdown_uses_compact_font = compact;
            }
            bool day_changed = force || !previous->exam.has_value ||
                               days != previous->exam.value/86400u;
            if (!day_changed) {
                /* A seconds tick only redraws the small clock window. */
            } else if (days == 0u) {
                lv_label_set_text(countdown_value, "0");
            } else if (!compact) {
                lv_label_set_text_fmt(countdown_value, "%03" PRIu32, days);
            } else if (days <= 9999u) {
                lv_label_set_text_fmt(countdown_value, "%" PRIu32, days);
            } else {
                lv_label_set_text(countdown_value, "9999+");
            }
            if (day_changed) align_countdown_readout(true);
            lv_label_set_text_fmt(countdown_time, "%02" PRIu32 ":%02" PRIu32 ":%02" PRIu32,
                                  hours, minutes, secs);
        }
    }

    if (force || model->exam.has_value != previous->exam.has_value ||
        model->exam.state != previous->exam.state ||
        (model->exam.value == 0u) != (previous->exam.value == 0u) ||
        model->connection != previous->connection) {
        if (model->exam.has_value && model->exam.value == 0) {
            lv_label_set_text(countdown_state, UI_TEXT_TARGET_REACHED);
        } else if (model->connection != MONITOR_CONNECTION_ONLINE && model->exam.has_value) {
            lv_label_set_text(countdown_state, UI_TEXT_OFFLINE_ESTIMATE);
        } else {
            lv_label_set_text(countdown_state, model->exam.state == UI_DATA_FRESH ? "" : ui_model_data_text(model->exam.state));
        }
    }
}

static void update_dynamic_content(void)
{
    if (!has_model) return;
    bool force = force_render || !has_rendered_model;
    if (force || latest_model.connection != rendered_model.connection) {
        uint32_t color = latest_model.connection == MONITOR_CONNECTION_ONLINE ? 0x4CE68A :
                         latest_model.connection == MONITOR_CONNECTION_OFFLINE ? 0xF17866 : 0xFFBA53;
        lv_obj_set_style_bg_color(status_dot, lv_color_hex(color), 0);
        lv_obj_set_style_shadow_color(status_dot, lv_color_hex(color), 0);
    }
    if (force || latest_model.connection != rendered_model.connection ||
        latest_model.cpu.state != rendered_model.cpu.state ||
        latest_model.memory.state != rendered_model.memory.state ||
        latest_model.exam.state != rendered_model.exam.state) update_connection_details();
    update_metric_view(&cpu_view, &cpu_history, &latest_model.cpu, &rendered_model.cpu, force);
    update_metric_view(&memory_view, &memory_history, &latest_model.memory, &rendered_model.memory, force);
    update_countdown(&latest_model, &rendered_model, force);
    rendered_model = latest_model;
    has_rendered_model = true;
    force_render = false;
}

void ui_shell_create(void)
{
    font_countdown = ui_font_poster_112;
    font_countdown.fallback = &ui_font_zh_16;
    font_countdown_compact = ui_font_numeric_56;
    font_countdown_compact.fallback = &ui_font_zh_16;
    screen = lv_scr_act();
    lv_obj_set_style_bg_color(screen, lv_color_hex(active_config.background_color), 0);
    lv_obj_clear_flag(screen, LV_OBJ_FLAG_SCROLLABLE);
    ui_router_init(&router, &active_config);

    status_plate = lv_obj_create(screen);
    lv_obj_set_pos(status_plate, UI_LAYOUT_HEADER_STATUS.x, UI_LAYOUT_HEADER_STATUS.y);
    lv_obj_set_size(status_plate, UI_LAYOUT_HEADER_STATUS.width, UI_LAYOUT_HEADER_STATUS.height);
    lv_obj_set_style_bg_opa(status_plate, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(status_plate, 0, 0);
    lv_obj_set_style_shadow_width(status_plate, 0, 0);
    lv_obj_set_style_shadow_ofs_y(status_plate, 2, 0);
    lv_obj_set_style_shadow_opa(status_plate, LV_OPA_50, 0);
    lv_obj_set_style_pad_all(status_plate, 0, 0);
    lv_obj_clear_flag(status_plate, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_add_flag(status_plate, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_ext_click_area(status_plate, 8);
    lv_obj_add_event_cb(status_plate, connection_event, LV_EVENT_PRESSED, NULL);
    lv_obj_add_event_cb(status_plate, connection_event, LV_EVENT_LONG_PRESSED, NULL);
    lv_obj_add_event_cb(status_plate, connection_event, LV_EVENT_SHORT_CLICKED, NULL);
    status_dot = make_decor(status_plate, 9, 3, 6, 6, 0xFFBA53, 3);
    lv_obj_set_style_shadow_color(status_dot, lv_color_hex(0xFFBA53), 0);
    lv_obj_set_style_shadow_width(status_dot, 6, 0);
    lv_obj_set_style_shadow_opa(status_dot, LV_OPA_30, 0);


    content = lv_obj_create(screen);
    lv_obj_set_pos(content, UI_LAYOUT_CONTENT.x, UI_LAYOUT_CONTENT.y);
    lv_obj_set_size(content, UI_LAYOUT_CONTENT.width, UI_LAYOUT_CONTENT.height);
    lv_obj_set_style_bg_opa(content, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(content, 0, 0);
    lv_obj_set_style_pad_all(content, 0, 0);
    /* Cards bubble gestures to this router surface. Base objects default to
     * GESTURE_BUBBLE too; leaving it enabled here skips this handler entirely. */
    lv_obj_clear_flag(content, LV_OBJ_FLAG_SCROLLABLE | LV_OBJ_FLAG_GESTURE_BUBBLE);
    lv_obj_add_event_cb(content, content_pressed, LV_EVENT_PRESSED, NULL);
    lv_obj_add_event_cb(content, gesture_event, LV_EVENT_GESTURE, NULL);

    navigation = lv_obj_create(screen);
    lv_obj_set_pos(navigation, UI_LAYOUT_NAVIGATION.x, UI_LAYOUT_NAVIGATION.y);
    lv_obj_set_size(navigation, UI_LAYOUT_NAVIGATION.width, UI_LAYOUT_NAVIGATION.height);
    lv_obj_set_style_bg_color(navigation, lv_color_hex(active_config.card_color), 0);
    lv_obj_set_style_bg_grad_color(navigation, lv_color_hex(active_config.background_color), 0);
    lv_obj_set_style_bg_grad_dir(navigation, LV_GRAD_DIR_VER, 0);
    lv_obj_set_style_border_color(navigation, lv_color_hex(0x050506), 0);
    lv_obj_set_style_border_width(navigation, 2, 0);
    lv_obj_set_style_radius(navigation, 24, 0);
    lv_obj_set_style_shadow_color(navigation, lv_color_hex(0x050506), 0);
    lv_obj_set_style_shadow_width(navigation, 0, 0);
    lv_obj_set_style_shadow_ofs_y(navigation, 3, 0);
    lv_obj_set_style_shadow_opa(navigation, LV_OPA_60, 0);
    lv_obj_set_style_pad_all(navigation, 0, 0);
    lv_obj_clear_flag(navigation, LV_OBJ_FLAG_SCROLLABLE);

    static const char *labels[] = {
        UI_TEXT_PAGE_OVERVIEW,
        UI_TEXT_PAGE_SYSTEM,
        UI_TEXT_PAGE_STUDY,
    };
    const int nav_width = UI_LAYOUT_NAVIGATION.width / 3;
    for (int index = 0; index < 3; ++index) {
        const int x = index * nav_width + 4;
        /* The last target absorbs the division remainder so the row stays flush. */
        const int segment_width = index == 2 ? UI_LAYOUT_NAVIGATION.width - 2 * nav_width : nav_width;
        const int width = segment_width - 8;
        nav_buttons[index] = lv_btn_create(navigation);
        lv_obj_set_pos(nav_buttons[index], x, 4);
        lv_obj_set_size(nav_buttons[index], width, 38);
        lv_obj_set_style_bg_opa(nav_buttons[index], LV_OPA_TRANSP, 0);
        lv_obj_set_style_border_width(nav_buttons[index], 0, 0);
        lv_obj_set_style_radius(nav_buttons[index], 20, 0);
        lv_obj_set_style_translate_y(nav_buttons[index], 1, LV_STATE_PRESSED);
        lv_obj_set_style_shadow_width(nav_buttons[index], 0, 0);
        /* LVGL's button theme adds horizontal padding. The label and indicator
         * below already use the button's full geometry, so retaining that theme
         * padding shifts all three navigation items to the right on hardware. */
        lv_obj_set_style_pad_all(nav_buttons[index], 0, 0);
        lv_obj_add_event_cb(nav_buttons[index], nav_event, LV_EVENT_CLICKED,
                            (void *)(intptr_t)index);
        nav_labels[index] = make_label(nav_buttons[index], labels[index], 0, 7,
                                       FONT_LABEL,
                                       lv_color_hex(UI_COLOR_TEXT_SECONDARY));
        lv_obj_set_width(nav_labels[index], width);
        lv_obj_set_style_text_align(nav_labels[index], LV_TEXT_ALIGN_CENTER, 0);
        nav_indicators[index] = lv_obj_create(nav_buttons[index]);
        lv_obj_set_pos(nav_indicators[index], 16, 16);
        lv_obj_set_size(nav_indicators[index], 6, 6);
        lv_obj_set_style_bg_color(nav_indicators[index],
                                  lv_color_hex(active_config.background_color), 0);
        lv_obj_set_style_border_width(nav_indicators[index], 0, 0);
        lv_obj_set_style_radius(nav_indicators[index], 3, 0);
        lv_obj_clear_flag(nav_indicators[index], LV_OBJ_FLAG_SCROLLABLE | LV_OBJ_FLAG_CLICKABLE);
    }
    rebuild_content();
}

void ui_shell_apply_config(const monitor_display_config_t *config)
{
    bool page_changed = active_config.page != config->page;
    active_config = *config;
    ui_router_apply_config(&router, config, page_changed);
    lv_obj_set_style_bg_color(screen, lv_color_hex(active_config.background_color), 0);
    lv_obj_set_style_bg_color(navigation, lv_color_hex(active_config.card_color), 0);
    lv_obj_set_style_bg_grad_color(navigation, lv_color_hex(active_config.background_color), 0);
    for (int index = 0; index < 3; ++index) {
        lv_obj_set_style_bg_color(nav_indicators[index],
                                  lv_color_hex(active_config.background_color), 0);
    }
    rebuild_content();
}

void ui_shell_update(const ui_model_t *model)
{
    record_history(&cpu_history, &model->cpu, model->connection);
    record_history(&memory_history, &model->memory, model->connection);
    latest_model = *model;
    has_model = true;
    update_dynamic_content();
}
