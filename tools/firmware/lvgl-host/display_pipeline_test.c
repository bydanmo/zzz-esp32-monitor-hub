/* Actual LVGL 8.4 partial renderer with deliberately delayed DMA completion.
 * Verify byte-exact frames and borrowed-buffer lifetime, not host speed. */
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "lvgl.h"
#include "display_pixels.h"

enum { W=480,H=320,LINES=24,STEPS=40 };
static lv_color_t buffers[2][W*LINES];
static uint16_t frame[W*H];
static lv_disp_draw_buf_t draw;
static struct {uint16_t *pixels;lv_area_t area;size_t count;uint32_t fingerprint;bool active;} dma;
static unsigned completions,overlapped_waits;
static int mode;

static uint32_t hash(const uint16_t *p,size_t count)
{
    uint32_t v=2166136261u;
    for(size_t i=0;i<count;i++){v^=p[i];v*=16777619u;}
    return v;
}
static void complete(lv_disp_drv_t *driver)
{
    if(!dma.active)return;
    assert(hash(dma.pixels,dma.count)==dma.fingerprint);
    if(mode && draw.buf_act!=(void *)dma.pixels)overlapped_waits++;
    size_t i=0;
    for(int y=dma.area.y1;y<=dma.area.y2;y++)for(int x=dma.area.x1;x<=dma.area.x2;x++) {
        const unsigned char *b=(const unsigned char *)&dma.pixels[i++];
        frame[y*W+x]=(uint16_t)((b[0]<<8)|b[1]);
    }
    dma.active=false;completions++;lv_disp_flush_ready(driver);
}
static void flush(lv_disp_drv_t *driver,const lv_area_t *area,lv_color_t *color)
{
    (void)driver;assert(!dma.active);
    size_t count=(size_t)(area->x2-area->x1+1)*(area->y2-area->y1+1);
    assert(count<=W*LINES);
    display_pixels_rgb565be((uint16_t *)color,count);
    dma.pixels=(uint16_t *)color;dma.area=*area;dma.count=count;
    dma.fingerprint=hash(dma.pixels,count);dma.active=true;
}
int main(void)
{
    uint16_t *colors=malloc((65536+2)*sizeof(uint16_t));assert(colors);
    colors[0]=0xcafe;colors[65537]=0xdead;
    for(unsigned i=0;i<65536;i++)colors[i+1]=(uint16_t)i;
    display_pixels_rgb565be(colors+1,65535); /* odd length and 2-byte alignment */
    for(unsigned i=0;i<65535;i++) {
        unsigned char *b=(unsigned char *)&colors[i+1];
        assert(b[0]==(i>>8)&&b[1]==(i&255));
    }
    assert(colors[0]==0xcafe&&colors[65536]==65535&&colors[65537]==0xdead);
    display_pixels_rgb565be(colors+65536,1);
    assert(((unsigned char *)&colors[65536])[0]==255&&((unsigned char *)&colors[65536])[1]==255);
    free(colors);
    uint16_t *reference=malloc(STEPS*sizeof(frame));assert(reference);
    lv_init();lv_disp_drv_t driver;lv_disp_drv_init(&driver);
    lv_disp_draw_buf_init(&draw,buffers[0],NULL,W*LINES);
    driver.hor_res=W;driver.ver_res=H;driver.draw_buf=&draw;driver.flush_cb=flush;driver.wait_cb=complete;
    lv_disp_t *display=lv_disp_drv_register(&driver);
    for(mode=0;mode<2;mode++) {
        complete(&driver);lv_disp_draw_buf_init(&draw,buffers[0],mode?buffers[1]:NULL,W*LINES);
        lv_obj_t *screen=lv_scr_act();lv_obj_clean(screen);
        lv_obj_set_style_bg_color(screen,lv_color_hex(0x152131),0);
        lv_obj_t *card=lv_obj_create(screen);lv_obj_set_size(card,173,123);
        lv_obj_set_style_radius(card,19,0);lv_obj_set_style_bg_color(card,lv_color_hex(0xfedc28),0);
        lv_obj_t *label=lv_label_create(card);lv_obj_set_style_text_color(label,lv_color_hex(0x102030),0);
        lv_obj_set_pos(label,3,21);
        lv_obj_invalidate(screen);
        for(int step=0;step<STEPS;step++) {
            lv_obj_set_pos(card,(step*31)%291,(step*17)%181);
            lv_label_set_text_fmt(label,"FRAME %02d / DMA",step);
            if(step%5==0)lv_obj_invalidate(screen);
            lv_refr_now(display);complete(&driver);
            if(!mode)memcpy(reference+step*W*H,frame,sizeof(frame));
            else assert(memcmp(reference+step*W*H,frame,sizeof(frame))==0);
        }
    }
    assert(completions>100&&overlapped_waits>100);
    free(reference);
    printf("Display pipeline: all RGB565 colors, odd/aligned bounds, %d byte-identical frame pairs, %u delayed DMA completions, %u overlap waits passed. Host simulation is not a hardware FPS measurement.\n",STEPS,completions,overlapped_waits);
    return 0;
}
