#include <assert.h>
#include <stdio.h>
#include "device_settings.h"

static uint32_t disk;
static bool exists,fail;
static int writes;
static uint8_t applied_brightness;
static bool applied_motion;
bool device_settings_storage_load(uint32_t *value) { *value=disk;return exists; }
bool device_settings_storage_save(uint32_t value) { ++writes;if(fail)return false;disk=value;exists=true;return true; }
void device_settings_apply(uint8_t brightness,bool reduced) { applied_brightness=brightness;applied_motion=reduced; }

int main(void)
{
    device_settings_init();
    assert(applied_brightness==100 && !applied_motion && device_settings_get()->screensaver);
    assert(writes==0 && device_settings_dirty());
    assert(device_settings_save());assert(writes==1);
    assert(device_settings_save());assert(writes==1);
    for(int n=90;n>=20;--n) device_settings_preview_brightness(n);
    assert(writes==1 && applied_brightness==20); /* Dragging must not write flash. */
    assert(device_settings_save());assert(writes==2);
    device_settings_init();assert(applied_brightness==20);
    device_settings_preview_brightness(-100);assert(applied_brightness==10);
    device_settings_preview_brightness(200);assert(applied_brightness==100);
    device_settings_preview_brightness(40);assert(device_settings_save());
    device_settings_set_reduced_motion(true);device_settings_set_screensaver(false);assert(device_settings_save());
    device_settings_init();assert(applied_brightness==40 && applied_motion && !device_settings_get()->screensaver);
    fail=true;device_settings_preview_brightness(70);
    assert(!device_settings_save() && device_settings_dirty() && applied_brightness==70);
    device_settings_init();assert(applied_brightness==40); /* Failed save never claims persistence. */
    device_settings_preview_brightness(70);fail=false;assert(device_settings_save());
    device_settings_init();assert(applied_brightness==70 && !device_settings_dirty());
    uint32_t bad[]={0,0xA5020264,0xA5010200,0xA5010265,0xA5018264};
    for(unsigned i=0;i<sizeof(bad)/sizeof(bad[0]);++i) {
        disk=bad[i];device_settings_init();assert(applied_brightness==100 && !applied_motion && device_settings_get()->screensaver);
    }
    puts("Local settings: defaults, clamp, deferred/deduplicated writes, save failure/retry, version validation and reboot persistence passed");
}
