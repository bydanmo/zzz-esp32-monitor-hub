#include "ui_art.h"
#include "ui_motion.h"
#include <stdint.h>

/* Direct LVGL primitives: no full-screen canvas or transformed image buffer. */
static void rect(lv_draw_ctx_t *ctx, int x, int y, int w, int h,
                 uint32_t fill, int radius, uint32_t stroke, int border)
{
    lv_draw_rect_dsc_t d;
    lv_draw_rect_dsc_init(&d);
    d.bg_color = lv_color_hex(fill);
    d.radius = radius;
    d.border_color = lv_color_hex(stroke);
    d.border_width = border;
    lv_area_t a = {x, y, x + w - 1, y + h - 1};
    lv_draw_rect(ctx, &d, &a);
}

static void line(lv_draw_ctx_t *ctx, int x, int y, int tx, int ty,
                 uint32_t color, int width)
{
    lv_draw_line_dsc_t d;
    lv_draw_line_dsc_init(&d);
    d.color = lv_color_hex(color); d.width = width;
    lv_point_t a = {x,y}, b = {tx,ty};
    lv_draw_line(ctx, &d, &a, &b);
}

static void art_draw(lv_event_t *event)
{
    lv_obj_t *obj = lv_event_get_target(event);
    lv_draw_ctx_t *ctx = lv_event_get_draw_ctx(event);
    lv_area_t area;
    lv_obj_get_coords(obj, &area);
    int x = area.x1, y = area.y1;
    int w = lv_obj_get_width(obj), h = lv_obj_get_height(obj);
    uint32_t signal = lv_color_to32(lv_obj_get_style_bg_color(obj, 0)) & 0xffffffu;
    ui_art_kind_t kind = (ui_art_kind_t)(intptr_t)lv_event_get_user_data(event);
    if (kind == UI_ART_TICKET) {
        lv_draw_rect_dsc_t d;
        lv_draw_rect_dsc_init(&d);
        d.bg_color = lv_color_hex(0x050506);
        lv_point_t outer[] = {{x,y+4},{x+w-12,y},{x+w-1,y+h-12},{x+14,y+h-1}};
        lv_draw_polygon(ctx, &d, outer, 4);
        d.bg_color = lv_color_hex(signal);
        lv_point_t inner[] = {{x+4,y+8},{x+w-16,y+4},{x+w-5,y+h-16},{x+18,y+h-5}};
        lv_draw_polygon(ctx, &d, inner, 4);
        int phase = (int)(intptr_t)lv_obj_get_user_data(obj);
        for (int row = 0; row < 3; ++row)
            for (int col = 0; col < 8; ++col)
                rect(ctx,x+w-74+col*8,y+38+row*7,
                     col == (phase/4)%8 ? 5 : 2,
                     col == (phase/4)%8 ? 5 : 2,0x242428,0,0,0);
        /* Conveyor stripes remain inside the original small printed strip. */
        const lv_area_t *saved_clip = ctx->clip_area;
        lv_area_t strip = {x+18,y+h-22,x+96,y+h-6}, clipped;
        if (_lv_area_intersect(&clipped, saved_clip, &strip)) {
            ctx->clip_area = &clipped;
            for (int i = -1; i < 9; ++i)
                line(ctx,x+20+i*10+phase%10,y+h-9,
                     x+25+i*10+phase%10,y+h-20,0x101012,3);
            ctx->clip_area = saved_clip;
        }
    } else if (kind == UI_ART_CASSETTE) {
        rect(ctx,x+5,y+6,w-5,h-6,0x030304,10,0,0);
        rect(ctx,x,y,w-5,h-7,0x444449,9,0x050506,3);
        rect(ctx,x+7,y+7,w-19,26,signal,3,0x050506,2);
        rect(ctx,x+9,y+40,w-23,64,0x0B0C0E,8,0x060607,3);
        int cy = y+72;
        int centers[] = {x+39,x+w-44};
        for (int i=0;i<2;++i) {
            int cx = centers[i];
            rect(ctx,cx-25,cy-25,50,50,0x27282B,25,0x8B8B84,2);
            rect(ctx,cx-17,cy-17,34,34,0xB8BAB1,17,0x080809,3);
            rect(ctx,cx-7,cy-7,14,14,0x111214,7,0,0);
            int phase = (int)(intptr_t)lv_obj_get_user_data(obj);
            for (int j=0;j<3;++j) {
                int angle = (phase+j*120)%360;
                int sn = lv_trigo_sin((int16_t)angle);
                int cs = lv_trigo_sin((int16_t)((angle+90)%360));
                line(ctx,cx+cs*7/32767,cy+sn*7/32767,
                     cx+cs*17/32767,cy+sn*17/32767,0x111214,3);
            }
        }
        line(ctx,centers[0]+18,cy-10,centers[1]-18,cy-10,0xB8BAB1,2);
        line(ctx,centers[0]+18,cy+10,centers[1]-18,cy+10,0xB8BAB1,2);
        rect(ctx,x+20,y+h-30,w-45,16,0x1A1B1D,3,0x050506,2);
        for(int i=0;i<4;++i) {
            int bx=x+(i%2 ? w-17:8), by=y+(i/2 ? h-19:10);
            rect(ctx,bx,by,5,5,0x93948D,3,0,0);
        }
    } else {
        for(int col=0;col<w;col+=5)
            line(ctx,x+col,y,x+col-5,y+h,0x08090B,2);
    }
}

static void reel_exec(void *object, int32_t phase)
{
    lv_obj_t *obj = object;
    phase = (phase/6)*6;
    if ((int32_t)(intptr_t)lv_obj_get_user_data(obj) == phase) return;
    lv_obj_set_user_data(obj, (void *)(intptr_t)phase);
    lv_area_t area;
    lv_obj_get_coords(obj, &area);
    /* Redraw the reels only; labels, shell and screen stay untouched. */
    area.x1 += 12; area.x2 -= 12; area.y1 += 45; area.y2 = area.y1+54;
    lv_obj_invalidate_area(obj, &area);
}

static void ticket_exec(void *object, int32_t phase)
{
    lv_obj_t *obj = object;
    phase = (phase/2)*2;
    int previous = (int32_t)(intptr_t)lv_obj_get_user_data(obj);
    if (previous == phase) return;
    lv_obj_set_user_data(obj, (void *)(intptr_t)phase);
    lv_area_t bounds;
    lv_obj_get_coords(obj, &bounds);
    lv_area_t dots = {bounds.x2-73,bounds.y1+38,bounds.x2-12,bounds.y1+57};
    lv_area_t strip = {bounds.x1+18,bounds.y2-21,bounds.x1+96,bounds.y2-5};
    /* Separate dirty rectangles keep the large readout and clock untouched. */
    if ((previous/4)%8 != (phase/4)%8) lv_obj_invalidate_area(obj, &dots);
    if (previous%10 != phase%10) lv_obj_invalidate_area(obj, &strip);
}

lv_obj_t *ui_art_create(lv_obj_t *parent, ui_art_kind_t kind, int x, int y,
                        int width, int height, uint32_t signal)
{
    lv_obj_t *obj = lv_obj_create(parent);
    lv_obj_set_pos(obj,x,y); lv_obj_set_size(obj,width,height);
    lv_obj_set_style_bg_color(obj,lv_color_hex(signal),0);
    lv_obj_set_style_bg_opa(obj,LV_OPA_TRANSP,0);
    lv_obj_set_style_border_width(obj,0,0);
    lv_obj_set_style_pad_all(obj,0,0);
    lv_obj_clear_flag(obj,LV_OBJ_FLAG_CLICKABLE | LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_add_flag(obj,LV_OBJ_FLAG_EVENT_BUBBLE | LV_OBJ_FLAG_GESTURE_BUBBLE);
    lv_obj_add_event_cb(obj,art_draw,LV_EVENT_DRAW_MAIN,(void *)(intptr_t)kind);
    if (kind == UI_ART_TICKET && !ui_motion_is_reduced()) {
        lv_anim_t print;
        lv_anim_init(&print);
        lv_anim_set_var(&print, obj);
        lv_anim_set_exec_cb(&print, ticket_exec);
        /* 160 is a common multiple of both printed pattern periods. */
        lv_anim_set_values(&print, 0, 159);
        lv_anim_set_time(&print, 5333);
        lv_anim_set_repeat_count(&print, LV_ANIM_REPEAT_INFINITE);
        lv_anim_start(&print);
    }
    if (kind == UI_ART_CASSETTE && !ui_motion_is_reduced()) {
        lv_anim_t spin;
        lv_anim_init(&spin);
        lv_anim_set_var(&spin, obj);
        lv_anim_set_exec_cb(&spin, reel_exec);
        lv_anim_set_values(&spin, 0, 359);
        lv_anim_set_time(&spin, 3600);
        lv_anim_set_repeat_count(&spin, LV_ANIM_REPEAT_INFINITE);
        lv_anim_start(&spin);
    }
    return obj;
}
