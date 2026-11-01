#include "crt_clock.h"
#include <stddef.h>
#include <string.h>
#ifdef ESP_PLATFORM
#include "esp_heap_caps.h"
#endif

bool crt_clock_parse(const char *iso, uint32_t *seconds)
{
    if (!iso || !seconds) return false;
    size_t length = strlen(iso);
    if (length < 20 || iso[4] != '-' || iso[7] != '-' || iso[10] != 'T' ||
        iso[13] != ':' || iso[16] != ':' || iso[length-1] != 'Z') return false;
    for (size_t i=0; i<19; ++i) {
        if (i==4 || i==7 || i==10 || i==13 || i==16) continue;
        if (iso[i] < '0' || iso[i] > '9') return false;
    }
    if (length > 20) {
        if (iso[19] != '.' || length < 22) return false;
        for (size_t i=20; i<length-1; ++i) if (iso[i]<'0' || iso[i]>'9') return false;
    }
    unsigned h=(iso[11]-'0')*10+iso[12]-'0';
    unsigned m=(iso[14]-'0')*10+iso[15]-'0';
    unsigned s=(iso[17]-'0')*10+iso[18]-'0';
    if (h>23 || m>59 || s>59) return false;
    *seconds = ((h+8)*3600+m*60+s)%86400;
    return true;
}

uint32_t crt_clock_seconds(uint32_t anchor, int64_t received_ms, int64_t now_ms)
{
    uint64_t elapsed = now_ms > received_ms ? (uint64_t)(now_ms-received_ms)/1000 : 0;
    return (uint32_t)((anchor+elapsed)%86400);
}

#define GLASS_BYTES (CRT_CLOCK_WIDTH*CRT_CLOCK_HEIGHT*2)
#ifdef ESP_PLATFORM
/* Preserve scarce internal heap for HTTP, SD and DMA allocations. */
static uint8_t *glass;
#else
static uint8_t host_glass[GLASS_BYTES];
static uint8_t *glass=host_glass;
#endif
static const uint8_t *prepared_background;

static uint16_t source_pixel(const uint8_t *background,int x,int y)
{
    size_t at=((size_t)(CRT_CLOCK_Y+y)*480+CRT_CLOCK_X+x)*2;
    return (uint16_t)((background[at]<<8)|background[at+1]);
}

static bool inside_glass(int x,int y)
{
    /* Coordinates follow the actual tilted face; the red case never enters it. */
    int plane_y=y*256+(x-8)*27;
    return x>=6&&x<=94&&y>=0&&y<CRT_CLOCK_HEIGHT&&plane_y>=14*256&&plane_y<=41*256;
}

static bool source_emitter(const uint8_t *background,int x,int y)
{
    if(!inside_glass(x,y))return false;
    uint16_t color=source_pixel(background,x,y);
    unsigned r=((color>>11)&31)*255/31,g=((color>>5)&63)*255/63,b=(color&31)*255/31;
    return r>64&&g>68&&r*10>b*11&&g*10>b*11;
}

static bool source_glow(const uint8_t *background,int x,int y)
{
    if(!inside_glass(x,y))return false;
    for(int dy=-1;dy<=1;dy++)for(int dx=-1;dx<=1;dx++)
        if(source_emitter(background,x+dx,y+dy))return true;
    return false;
}

bool crt_clock_prepare(const uint8_t *background)
{
    if(!background)return false;
#ifdef ESP_PLATFORM
    if(!glass)glass=heap_caps_malloc(GLASS_BYTES,MALLOC_CAP_SPIRAM|MALLOC_CAP_8BIT);
    if(!glass)return false;
#endif
    for (int y=0; y<CRT_CLOCK_HEIGHT; ++y)
        memcpy(glass+(size_t)y*CRT_CLOCK_WIDTH*2,
               background+((size_t)(CRT_CLOCK_Y+y)*480+CRT_CLOCK_X)*2, CRT_CLOCK_WIDTH*2);
    /* Remove only the baked 11 13 emitters and their bloom. Restore each from
     * nearby unlit glass, rather than painting a flat polygon over the face. */
    for(int y=0;y<CRT_CLOCK_HEIGHT;y++)for(int x=0;x<CRT_CLOCK_WIDTH;x++) {
        if(!source_glow(background,x,y))continue;
        unsigned red=0,green=0,blue=0,weight=0;
        for(int dy=-5;dy<=5;dy++)for(int dx=-5;dx<=5;dx++) {
            int sx=x+dx,sy=y+dy;
            if(!inside_glass(sx,sy)||source_glow(background,sx,sy))continue;
            int distance=(dx<0?-dx:dx)+(dy<0?-dy:dy);
            unsigned w=(unsigned)(11-distance);
            uint16_t color=source_pixel(background,sx,sy);
            red+=((color>>11)&31)*w;green+=((color>>5)&63)*w;blue+=(color&31)*w;weight+=w;
        }
        if(weight) {
            uint16_t color=(uint16_t)(((red/weight)<<11)|((green/weight)<<5)|(blue/weight));
            size_t at=((size_t)y*CRT_CLOCK_WIDTH+x)*2;
            glass[at]=(uint8_t)(color>>8);glass[at+1]=(uint8_t)color;
        }
    }
    prepared_background=background;
    return true;
}

static void tint(uint8_t *pixels,int x,int y,unsigned red,unsigned green,unsigned blue,unsigned alpha)
{
    if(!inside_glass(x,y)||!alpha)return;
    size_t at=((size_t)y*CRT_CLOCK_WIDTH+x)*2;
    uint16_t color=(uint16_t)((pixels[at]<<8)|pixels[at+1]);
    unsigned r=((color>>11)&31)*255/31,g=((color>>5)&63)*255/63,b=(color&31)*255/31;
    r=(r*(255-alpha)+red*alpha+127)/255;
    g=(g*(255-alpha)+green*alpha+127)/255;
    b=(b*(255-alpha)+blue*alpha+127)/255;
    color=(uint16_t)(((r*31/255)<<11)|((g*63/255)<<5)|(b*31/255));
    pixels[at]=(uint8_t)(color>>8);pixels[at+1]=(uint8_t)color;
}

static void emitter(uint8_t *pixels,int u,int v,unsigned brightness)
{
    /* Q8 plane projection: vertical stems lean with the clock's glass, and
     * every dot shares the same rising baseline instead of stair-step letters. */
    int qx=u+(v-18*256)*9/256,qy=v-(u-8*256)*27/256;
    for(int y=qy/256-2;y<=qy/256+2;y++)for(int x=qx/256-2;x<=qx/256+2;x++) {
        int dx=x*256+128-qx,dy=y*256+128-qy;
        unsigned radius=(unsigned)(dx*dx+dy*dy)/256;
        if(radius>=1024)continue;
        unsigned halo=(1024-radius)*36/1024;
        tint(pixels,x,y,109,119,51,halo*brightness/255);
        if(radius<430) {
            unsigned alpha=radius<140?242:(430-radius)*242/290;
            tint(pixels,x,y,228,232,145,alpha*brightness/255);
        }
    }
}

void crt_clock_render(uint8_t *pixels, const uint8_t *background, uint32_t seconds, bool valid)
{
    if(!pixels||!background)return;
    if(prepared_background!=background&&!crt_clock_prepare(background))return;
    memcpy(pixels,glass,GLASS_BYTES);
    static const uint8_t digits[10][7]={
        {14,17,17,17,17,17,14},{4,12,4,4,4,4,14},
        {14,17,1,2,4,8,31},{30,1,1,14,1,1,30},
        {2,6,10,18,31,2,2},{31,16,16,30,1,1,30},
        {14,16,16,30,17,17,14},{31,1,2,4,8,8,8},
        {14,17,17,14,17,17,14},{14,17,17,15,1,1,14}};
    seconds%=86400;
    unsigned values[]={seconds/36000,(seconds/3600)%10,(seconds/600)%6,(seconds/60)%10};
    const int positions[]={8,28,59,79};
    for (int i=0; i<4; ++i) {
        for (int row=0; row<7; ++row) for (int col=0; col<5; ++col) {
            unsigned bits=valid?digits[values[i]][row]:(row==3?14:0);
            if (!(bits & (1u<<(4-col))))continue;
            emitter(pixels,positions[i]*256+col*650,18*256+row*775,248+(unsigned)(i+row+col)%8);
        }
    }
    if (valid && seconds%2==0)for(int row=0;row<2;row++)
        emitter(pixels,49*256,24*256+row*7*256,205);
}
