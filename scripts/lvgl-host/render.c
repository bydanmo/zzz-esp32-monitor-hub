/* Actual LVGL renderer. Synthetic data/input are explicitly test fixtures. */
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "lvgl.h"
#include "ui_shell.h"
#include "ui_motion.h"
#include "ui_layouts.generated.h"

static unsigned char frame[320][480][3];
static unsigned long long flushed_pixels;
static lv_point_t pointer;
static bool pressed;
static int checks;

static void flush(lv_disp_drv_t *driver, const lv_area_t *area, lv_color_t *pixels)
{
    for (int y = area->y1; y <= area->y2; ++y) {
        for (int x = area->x1; x <= area->x2; ++x) {
            lv_color32_t color = {.full = lv_color_to32(*pixels++)};
            frame[y][x][0] = color.ch.blue;
            frame[y][x][1] = color.ch.green;
            frame[y][x][2] = color.ch.red;
            ++flushed_pixels;
        }
    }
    lv_disp_flush_ready(driver);
}

static void input(lv_indev_drv_t *driver, lv_indev_data_t *data)
{
    (void)driver;
    data->point = pointer;
    data->state = pressed ? LV_INDEV_STATE_PRESSED : LV_INDEV_STATE_RELEASED;
}

static void step(int milliseconds)
{
    for (int i = 0; i < milliseconds; i += 5) {
        lv_tick_inc(5);
        lv_timer_handler();
    }
}

static void tap(int x, int y, int hold)
{
    pointer = (lv_point_t){x, y};
    pressed = true;
    step(hold);
    pressed = false;
    step(400);
}

static void drag(int x, int y, int dx, int dy)
{
    pointer = (lv_point_t){x, y};
    pressed = true;
    step(60);
    for (int i = 1; i <= 6; ++i) {
        pointer = (lv_point_t){x + dx * i / 6, y + dy * i / 6};
        step(35);
    }
    pressed = false;
    step(400);
}

static bool has_text(lv_obj_t *object, const char *text)
{
    if (lv_obj_check_type(object, &lv_label_class) &&
        strstr(lv_label_get_text(object), text) != NULL) return true;
    for (uint32_t i = 0; i < lv_obj_get_child_cnt(object); ++i)
        if (has_text(lv_obj_get_child(object, i), text)) return true;
    return false;
}

static void expect(const char *text)
{
    if (!has_text(lv_scr_act(), text)) {
        fprintf(stderr, "Missing label: %s\n", text);
        exit(2);
    }
    fprintf(stderr, "check %02d: %s\n", checks + 1, text);
    ++checks;
}

static lv_obj_t *find_label(lv_obj_t *object, const char *text)
{
    if (lv_obj_check_type(object, &lv_label_class) &&
        strcmp(lv_label_get_text(object), text) == 0) return object;
    for (uint32_t i=0; i<lv_obj_get_child_cnt(object); ++i) {
        lv_obj_t *found = find_label(lv_obj_get_child(object,i), text);
        if (found) return found;
    }
    return NULL;
}

static lv_obj_t *find_chart(lv_obj_t *object)
{
    if (lv_obj_check_type(object, &lv_chart_class)) return object;
    for (uint32_t i = 0; i < lv_obj_get_child_cnt(object); ++i) {
        lv_obj_t *found = find_chart(lv_obj_get_child(object, i));
        if (found) return found;
    }
    return NULL;
}

static void expect_page(monitor_page_t page)
{
    const char *names[]={"总览","系统","学习"};
    for(int i=0;i<3;++i) {
        lv_obj_t *label=find_label(lv_scr_act(),names[i]);
        assert(label);
        assert(lv_obj_get_style_outline_width(lv_obj_get_parent(label),0)==(i==(int)page?2:0));
    }
    ++checks;
}

/* Independent measurement from the rendered object tree and LVGL glyph
 * descriptors. Font line boxes alone cannot detect this layout regression. */
static lv_area_t text_ink(lv_obj_t *label)
{
    assert(label);
    lv_area_t box; lv_obj_get_coords(label,&box);
    const lv_font_t *font = lv_obj_get_style_text_font(label,0);
    const char *text = lv_label_get_text(label);
    lv_area_t result = {32767,32767,-32768,-32768};
    uint32_t at=0;
    int pen=box.x1;
    while(text[at]) {
        uint32_t code=_lv_txt_encoded_next(text,&at), peek=at;
        uint32_t next=_lv_txt_encoded_next(text,&peek);
        lv_font_glyph_dsc_t g;
        assert(lv_font_get_glyph_dsc(font,&g,code,next));
        if(g.box_w && g.box_h) {
            int x=pen+g.ofs_x;
            int y=box.y1+font->line_height-font->base_line-g.box_h-g.ofs_y;
            result.x1=LV_MIN(result.x1,x); result.x2=LV_MAX(result.x2,x+g.box_w-1);
            result.y1=LV_MIN(result.y1,y); result.y2=LV_MAX(result.y2,y+g.box_h-1);
        }
        pen+=g.adv_w+lv_obj_get_style_text_letter_space(label,0);
    }
    return result;
}

static void check_countdown_geometry(const char *digits, bool has_value)
{
    lv_obj_t *value=find_label(lv_scr_act(),digits);
    lv_obj_t *unit=find_label(lv_scr_act(),"天");
    assert(value && unit);
    lv_area_t card; lv_obj_get_coords(lv_obj_get_parent(value),&card);
    lv_area_t ink=text_ink(value);
    lv_area_t heading=text_ink(find_label(lv_scr_act(),"考研倒计时"));
    /* Visible readout stays clear of both the title plate and clock window. */
    assert(ink.y1>=card.y1+52 && ink.y2<card.y1+UI_LAYOUT_CONTENT.height-80);
    assert(ink.y1-heading.y2>=8);
    assert(card.y1+UI_LAYOUT_CONTENT.height-61-ink.y2>=8);
    assert(ink.x1>=card.x1+22 && ink.x2<card.x1+266);
    if(has_value) {
        lv_area_t unit_ink=text_ink(unit);
        assert(!lv_obj_has_flag(unit,LV_OBJ_FLAG_HIDDEN));
        assert(unit_ink.x1-ink.x2>=8 && unit_ink.y2==ink.y2);
        assert(unit_ink.x2<card.x1+266);
    } else assert(lv_obj_has_flag(unit,LV_OBJ_FLAG_HIDDEN));
    ++checks;
}

static void check_metric_geometry(const char *text, bool large)
{
    lv_obj_t *value=find_label(lv_scr_act(),text);
    assert(value);
    lv_obj_t *card=lv_obj_get_parent(value);
    lv_area_t bounds; lv_obj_get_coords(card,&bounds);
    lv_area_t ink=text_ink(value);
    if(large) {
        lv_obj_t *dial=NULL;
        for(uint32_t i=0;i<lv_obj_get_child_cnt(card);++i) {
            lv_obj_t *child=lv_obj_get_child(card,i);
            if(lv_obj_check_type(child,&lv_arc_class)) dial=child;
        }
        assert(dial);
        lv_area_t arc; lv_obj_get_coords(dial,&arc);
        assert(abs(ink.x1+ink.x2-arc.x1-arc.x2)<=2);
        assert(abs(ink.y1+ink.y2-arc.y1-arc.y2)<=2);
        int half_width=(lv_area_get_width(&ink)+1)/2;
        int half_height=(lv_area_get_height(&ink)+1)/2;
        int clearance=lv_area_get_width(&arc)/2-12;
        assert(half_width*half_width+half_height*half_height<clearance*clearance);
    } else {
        assert(ink.y1>=bounds.y1+43 && ink.y2<=bounds.y2-24);
        assert(ink.x1>=bounds.x1+19 && ink.x2<bounds.x2-16);
        assert(bounds.y2-13-ink.y2>=8);
    }
    ++checks;
}

static void bitmap(const char *directory, const char *name)
{
    char path[512];
    snprintf(path, sizeof(path), "%s/%s.bmp", directory, name);
    FILE *file = fopen(path, "wb");
    assert(file);
    unsigned char header[54] = {'B','M'};
    uint32_t size = 54 + sizeof(frame), offset = 54, dib = 40;
    int32_t width = 480, height = -320;
    uint16_t planes = 1, bpp = 24;
    memcpy(header + 2, &size, 4); memcpy(header + 10, &offset, 4);
    memcpy(header + 14, &dib, 4); memcpy(header + 18, &width, 4);
    memcpy(header + 22, &height, 4); memcpy(header + 26, &planes, 2);
    memcpy(header + 28, &bpp, 2);
    fwrite(header, 1, sizeof(header), file);
    fwrite(frame, 1, sizeof(frame), file);
    fclose(file);
}

static uint32_t region_hash(int x, int y, int width, int height)
{
    uint32_t hash=2166136261u;
    for (int row=y; row<y+height; ++row)
        for (int col=x; col<x+width; ++col)
            for (int c=0; c<3; ++c) hash=(hash^frame[row][col][c])*16777619u;
    return hash;
}

int main(int argc, char **argv)
{
    assert(argc == 2);
    lv_init();
    static lv_color_t pixels[480 * 24];
    static lv_disp_draw_buf_t buffer;
    static lv_disp_drv_t display;
    lv_disp_draw_buf_init(&buffer, pixels, NULL, 480 * 24);
    lv_disp_drv_init(&display);
    display.hor_res = 480; display.ver_res = 320;
    display.draw_buf = &buffer; display.flush_cb = flush;
    lv_disp_drv_register(&display);
    static lv_indev_drv_t device;
    lv_indev_drv_init(&device);
    device.type = LV_INDEV_TYPE_POINTER; device.read_cb = input;
    device.gesture_limit = 40;
    lv_indev_drv_register(&device);
    ui_shell_create();
    monitor_display_config_t config = {
        .title = "ESP32 监控屏", .page = MONITOR_PAGE_OVERVIEW,
        .background_color = 0x131416, .card_color = 0x232426,
        .accent_color = 0xF5ED00, .data_text_color = 0xF5ED00,
        .show_cpu = true, .show_memory = true, .show_exam = true,
    };
    ui_model_t model;
    ui_model_init(&model);
    model.connection = MONITOR_CONNECTION_ONLINE;
    model.cpu = (ui_metric_model_t){74, true, UI_DATA_FRESH, 0};
    model.memory = (ui_metric_model_t){52, true, UI_DATA_FRESH, 0};
    model.exam = (ui_metric_model_t){428u * 86400u + 13u * 3600u + 8u * 60u + 19u, true, UI_DATA_FRESH, 0};
    /* Reference pictures include an explicitly synthetic but representative trace. */
    for (int i = 0; i < 24; ++i) {
        model.cpu.value = (i * 17 + 12) % 101;
        model.memory.value = 40 + (i * 3) % 20;
        model.cpu.last_update_ms = model.memory.last_update_ms = (i + 1) * 1000;
        ui_shell_update(&model);
    }
    model.cpu = (ui_metric_model_t){74, true, UI_DATA_FRESH, 25000};
    model.memory = (ui_metric_model_t){52, true, UI_DATA_FRESH, 25000};
    const char *themes[] = {"signal", "tape", "arcade", "night", "acid", "paper"};
    uint32_t palette[][3] = {
        {0x131416, 0x232426, 0xF5ED00}, {0x191512, 0x302721, 0xFFAD48},
        {0x101A22, 0x20313E, 0x70DDFF}, {0x1A1422, 0x30273B, 0xF5A0FF},
        {0x151A11, 0x283021, 0xC5F31B}, {0x191713, 0x2B2721, 0xFF6B55}
    };
    const char *pages[] = {"overview", "system", "study"};
    for (int theme = 0; theme < 6; ++theme) {
        config.background_color = palette[theme][0]; config.card_color = palette[theme][1];
        config.accent_color = config.data_text_color = palette[theme][2];
        for (int page = 0; page < 3; ++page) {
            config.page = (monitor_page_t)page;
            ui_shell_apply_config(&config); ui_shell_update(&model); step(500);
            assert(!has_text(lv_scr_act(), "DM01"));
            assert(!has_text(lv_scr_act(), "ESP32 监控屏"));
            assert(!has_text(lv_scr_act(), "Hub 已在线"));
            assert(frame[6][464][1]>frame[6][464][0] && frame[6][464][1]>frame[6][464][2]);
            assert(memcmp(frame[0][5],frame[319][475],3)==0);
            lv_obj_t *nav_label=find_label(lv_scr_act(),page==0?"总览":page==1?"系统":"学习");
            assert(nav_label && lv_obj_get_style_outline_width(lv_obj_get_parent(nav_label),0)==2);
            if(page==2) assert(!has_text(lv_scr_act(),"刚刚更新"));
            ++checks;
            if (page != 1) {
                lv_obj_t *clock = find_label(lv_scr_act(), "13:08:19");
                assert(clock);
                const lv_font_t *font = lv_obj_get_style_text_font(clock, 0);
                lv_font_glyph_dsc_t colon, percent;
                assert(lv_font_get_glyph_dsc(font, &colon, ':', '0'));
                assert(lv_font_get_glyph_dsc(font, &percent, '%', '0'));
                assert(colon.box_w < percent.box_w);
                lv_area_t ink = text_ink(clock), parent;
                lv_obj_get_coords(lv_obj_get_parent(clock), &parent);
                assert(ink.y1 >= parent.y1 + 175 && ink.y2 <= parent.y1 + 205);
                ++checks;
            }
            if(page!=1) check_countdown_geometry("428",true);
            if(page!=2) {
                check_metric_geometry("74%",page==1);
                check_metric_geometry("52%",page==1);
            }
            char name[64]; snprintf(name, sizeof(name), "%s-%s", themes[theme], pages[page]);
            bitmap(argv[1], name);
        }
    }
    /* Collect distinct real sample fixtures while the charts are not visible. */
    config.page = MONITOR_PAGE_OVERVIEW;
    ui_shell_apply_config(&config);
    for (int i = 0; i < 24; ++i) {
        model.cpu.value = (i * 17 + 12) % 101;
        model.memory.value = 40 + (i * 3) % 20;
        model.cpu.last_update_ms = model.memory.last_update_ms = (i + 1) * 1000;
        ui_shell_update(&model); step(30);
    }
    config.page = MONITOR_PAGE_SYSTEM;
    ui_shell_apply_config(&config); step(400);
    lv_obj_t *cpu_label = find_label(lv_scr_act(), "CPU");
    lv_obj_t *chart = find_chart(lv_obj_get_parent(cpu_label));
    assert(chart);
    lv_chart_series_t *series = lv_chart_get_series_next(chart, NULL);
    lv_coord_t *trace = lv_chart_get_y_array(chart, series);
    assert(trace[0] == 12 && trace[23] == (23 * 17 + 12) % 101); ++checks;
    lv_coord_t saved[24]; memcpy(saved, trace, sizeof(saved));
    ui_shell_update(&model); step(30);
    assert(memcmp(saved, trace, sizeof(saved)) == 0); ++checks;
    model.connection = MONITOR_CONNECTION_OFFLINE;
    ui_shell_update(&model); step(30);
    assert(trace[23] == LV_CHART_POINT_NONE && trace[22] == saved[23]); ++checks;
    memcpy(saved, trace, sizeof(saved));
    ui_shell_update(&model); step(30);
    assert(memcmp(saved, trace, sizeof(saved)) == 0); ++checks;
    model.connection = MONITOR_CONNECTION_ONLINE;
    model.cpu.last_update_ms = model.memory.last_update_ms = 25000;
    ui_shell_update(&model); step(30);
    assert(trace[22] == LV_CHART_POINT_NONE && trace[23] == (int)model.cpu.value); ++checks;
    model.cpu.state = UI_DATA_INVALID;
    model.cpu.has_value = false;
    ui_shell_update(&model); step(30);
    assert(trace[23] == LV_CHART_POINT_NONE); ++checks;
    model.cpu = (ui_metric_model_t){74, true, UI_DATA_FRESH, 26000};
    model.memory = (ui_metric_model_t){52, true, UI_DATA_FRESH, 26000};
    ui_shell_update(&model); step(400);
    bitmap(argv[1], "system-live-traces");
    /* Restore overview explicitly before exercising real LVGL input routing. */
    config.page = MONITOR_PAGE_OVERVIEW;
    ui_shell_apply_config(&config); step(400);
    expect_page(MONITOR_PAGE_OVERVIEW);
    tap(240, 287, 90); expect_page(MONITOR_PAGE_SYSTEM);
    ui_shell_update(&model); step(50); expect_page(MONITOR_PAGE_SYSTEM);
    tap(390, 287, 90); expect_page(MONITOR_PAGE_STUDY);
    tap(464, 6, 90); expect("连接详情");
    model.connection = MONITOR_CONNECTION_OFFLINE;
    ui_shell_update(&model); step(100); expect("Hub 已离线\nCPU");
    model.connection = MONITOR_CONNECTION_ONLINE;
    ui_shell_update(&model); step(100);
    tap(390, 287, 90); expect_page(MONITOR_PAGE_STUDY);
    tap(464, 6, 90); expect("连接详情");
    tap(464, 6, 90); expect_page(MONITOR_PAGE_STUDY);
    tap(464, 6, 650); expect("动效已简化");
    assert(ui_motion_is_reduced()); ++checks;
    bitmap(argv[1], "motion-reduced");
    tap(464, 6, 650); expect("动效已开启");
    assert(!ui_motion_is_reduced()); ++checks;
    tap(240, 287, 90); expect_page(MONITOR_PAGE_SYSTEM);
    config.show_cpu = config.show_memory = false;
    ui_shell_apply_config(&config); step(400); expect_page(MONITOR_PAGE_OVERVIEW);
    config.show_exam = false;
    ui_shell_apply_config(&config); step(400);
    expect("没有可显示的指标\n请在网页中调整");
    bitmap(argv[1], "all-disabled");
    config.show_exam = config.show_cpu = config.show_memory = true;
    config.page = MONITOR_PAGE_STUDY;
    ui_shell_apply_config(&config);
    model.exam.value = 0; ui_shell_update(&model); step(400); expect("目标时间已到");
    bitmap(argv[1], "target-reached");
    model.exam.value = UINT32_MAX;
    ui_shell_update(&model); step(400); expect("9999+"); expect("天");
    bitmap(argv[1], "countdown-overflow");
    model.connection = MONITOR_CONNECTION_OFFLINE;
    ui_shell_update(&model); step(400); expect("离线估算");
    bitmap(argv[1], "offline-estimate");
    model.exam.has_value = false;
    ui_shell_update(&model); step(400); expect("--");
    bitmap(argv[1], "missing-countdown");
    check_countdown_geometry("--",false);
    model.exam.has_value=true;
    const uint32_t day_cases[]={0,1,427,999,1000,9999,10000};
    const char *day_labels[]={"0","001","427","999","1000","9999","9999+"};
    for(unsigned i=0;i<sizeof(day_cases)/sizeof(day_cases[0]);++i) {
        model.exam.value=day_cases[i]*86400u;
        ui_shell_update(&model); step(400);
        check_countdown_geometry(day_labels[i],true);
        char name[64]; snprintf(name,sizeof(name),"layout-days-%u",day_cases[i]);
        bitmap(argv[1],name);
    }
    model.exam = (ui_metric_model_t){428u*86400u+5000u,true,UI_DATA_FRESH,0};
    model.connection = MONITOR_CONNECTION_ONLINE;
    /* Isolate countdown invalidation from intentional ambient movement. */
    ui_motion_set_reduced(true);
    ui_shell_apply_config(&config); step(400);
    ui_shell_update(&model); step(500);
    unsigned long long before_clock = flushed_pixels;
    --model.exam.value;
    ui_shell_update(&model); step(400);
    unsigned long long clock_pixels = flushed_pixels-before_clock;
    assert(clock_pixels > 0 && clock_pixels < 448u*188u/2u); ++checks;
    ui_motion_set_reduced(false);
    config.page = MONITOR_PAGE_SYSTEM;
    ui_shell_apply_config(&config);
    model.cpu.has_value = model.memory.has_value = false;
    model.cpu.state = UI_DATA_INVALID; model.memory.state = UI_DATA_UNAVAILABLE;
    ui_shell_update(&model); step(400); expect("数据异常"); expect("暂无数据");
    bitmap(argv[1], "invalid-unavailable");
    check_metric_geometry("--",true);
    for(uint32_t percent=0;percent<=100;percent+=100) {
        model.cpu.has_value=true; model.cpu.value=percent;
        ui_shell_update(&model); step(400);
        char text[16]; snprintf(text,sizeof(text),"%u%%",percent);
        check_metric_geometry(text,true);
        char name[64]; snprintf(name,sizeof(name),"system-percent-%u",percent);
        bitmap(argv[1],name);
    }
    /* Full motion keeps a bounded background strip alive, even with stationary
     * telemetry. Reduced motion must still become completely idle. */
    unsigned long long before = flushed_pixels;
    ui_shell_update(&model);
    step(1000);
    unsigned long long idle_pixels = flushed_pixels - before;
    assert(idle_pixels > 0 && idle_pixels < 500000); ++checks;
    ui_motion_set_reduced(true);
    ui_shell_apply_config(&config); step(400);
    before = flushed_pixels;
    ui_shell_update(&model); step(1000);
    assert(flushed_pixels == before); ++checks;
    ui_motion_set_reduced(false);
    config.page = MONITOR_PAGE_OVERVIEW;
    ui_shell_apply_config(&config); step(400);
    drag(220, 145, -110, 2); expect_page(MONITOR_PAGE_SYSTEM);
    drag(120, 100, 8, 105); expect_page(MONITOR_PAGE_SYSTEM);
    config.page = MONITOR_PAGE_OVERVIEW;
    ui_shell_apply_config(&config); step(400);
    drag(110, 145, 110, 2); expect_page(MONITOR_PAGE_OVERVIEW);
    /* Enlarged faces also have to fit narrow single-metric cards and 100%. */
    model.cpu=(ui_metric_model_t){100,true,UI_DATA_FRESH,0};
    model.memory=(ui_metric_model_t){0,true,UI_DATA_FRESH,0};
    ui_shell_update(&model); step(400);
    check_metric_geometry("100%",false); check_metric_geometry("0%",false);
    bitmap(argv[1],"overview-percent-boundaries");
    config.show_memory=false;
    ui_shell_apply_config(&config); step(400);
    check_metric_geometry("100%",true);
    bitmap(argv[1],"overview-single-cpu");
    config.show_cpu=false; config.show_memory=true;
    ui_shell_apply_config(&config); step(400);
    check_metric_geometry("0%",true);
    bitmap(argv[1],"overview-single-memory");
    config.page=MONITOR_PAGE_STUDY;
    config.show_cpu=config.show_memory=config.show_exam=true;
    config.background_color=0x131416; config.card_color=0x232426;
    config.accent_color=config.data_text_color=0xF5ED00;
    model.exam=(ui_metric_model_t){428u*86400u+5000u,true,UI_DATA_FRESH,0};
    ui_motion_set_reduced(false);
    ui_shell_apply_config(&config); ui_shell_update(&model); step(500);
    unsigned char reels_before[55][132][3];
    for(int y=0;y<55;y++) memcpy(reels_before[y],frame[105+y][325],sizeof(reels_before[y]));
    unsigned long long study_before=flushed_pixels;
    for(int i=0;i<40;i++) {
        char name[40]; snprintf(name,sizeof(name),"study-motion-%03d",i);
        bitmap(argv[1],name);
        if(i%10==9) {--model.exam.value;ui_shell_update(&model);}
        step(100);
    }
    bool reels_changed=false;
    for(int y=0;y<55;y++) if(memcmp(reels_before[y],frame[105+y][325],sizeof(reels_before[y]))) reels_changed=true;
    assert(reels_changed); ++checks;
    unsigned long long study_pixels=flushed_pixels-study_before;
    assert(study_pixels>0 && study_pixels<4ULL*600000); ++checks;
    config.page=MONITOR_PAGE_SYSTEM;
    ui_shell_apply_config(&config); step(400);
    unsigned long long system_before=flushed_pixels;
    for (int i=0; i<40; ++i) {
        if (i%10==0) {
            model.cpu.value=35+(i*7)%61;
            model.memory.value=48+(i/10)%4;
            model.cpu.last_update_ms=model.memory.last_update_ms=30000+(i/10)*1000;
            ui_shell_update(&model);
        }
        step(100);
        char name[40]; snprintf(name,sizeof(name),"system-motion-%03d",i);
        bitmap(argv[1],name);
    }
    unsigned long long system_pixels=flushed_pixels-system_before;
    assert(system_pixels>0 && system_pixels<4ULL*600000); ++checks;
    bitmap(argv[1],"system-live-traces");
    config.page=MONITOR_PAGE_OVERVIEW;
    model.cpu=(ui_metric_model_t){74,true,UI_DATA_FRESH,40000};
    model.memory=(ui_metric_model_t){52,true,UI_DATA_FRESH,40000};
    ui_shell_apply_config(&config); ui_shell_update(&model); step(500);
    uint32_t dots_hash=region_hash(222,58,64,32);
    uint32_t stripe_hash=region_hash(30,230,80,17);
    uint32_t bar_hash=region_hash(331,114,124,6);
    uint32_t readout_hash=region_hash(55,92,194,85);
    step(570);
    assert(region_hash(222,58,64,32)!=dots_hash); ++checks;
    assert(region_hash(30,230,80,17)!=stripe_hash); ++checks;
    assert(region_hash(331,114,124,6)!=bar_hash); ++checks;
    assert(region_hash(55,92,194,85)==readout_hash); ++checks;
    unsigned long long overview_before=flushed_pixels;
    for(int i=0;i<60;++i) {
        if(i%15==0) {
            model.cpu.value=40+(i*3)%49;
            model.memory.value=50+i/15;
            model.cpu.last_update_ms=model.memory.last_update_ms=41000+i*67;
            --model.exam.value; ui_shell_update(&model);
        }
        step(67);
        char name[40]; snprintf(name,sizeof(name),"overview-motion-%03d",i);
        bitmap(argv[1],name);
    }
    unsigned long long overview_pixels=flushed_pixels-overview_before;
    assert(overview_pixels>0 && overview_pixels<4ULL*600000); ++checks;
    model.cpu.state=UI_DATA_STALE;
    ui_shell_update(&model); step(400);
    bar_hash=region_hash(331,114,124,6);
    step(700);
    assert(region_hash(331,114,124,6)==bar_hash); ++checks;
    ui_motion_set_reduced(true);
    ui_shell_apply_config(&config); step(500);
    before=flushed_pixels; step(1000);
    assert(flushed_pixels==before); ++checks;
    printf("{\"checks\":%d,\"idleFlushPixels\":%llu,\"clockTickFlushPixels\":%llu,\"studyMotion4sFlushPixels\":%llu,\"systemMotion4sFlushPixels\":%llu,\"overviewMotion4sFlushPixels\":%llu,\"source\":\"LVGL 8.4 host renderer; synthetic fixtures\"}\n",
           checks, idle_pixels, clock_pixels, study_pixels, system_pixels, overview_pixels);
    return 0;
}
