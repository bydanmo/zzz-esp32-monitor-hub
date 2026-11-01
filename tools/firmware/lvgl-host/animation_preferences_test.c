#include "animation_preferences.h"
#include "media_catalog.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>

static uint8_t store[ANIMATION_PREFERENCES_BYTES];
static bool exists,failed;
static unsigned writes;
bool animation_preferences_storage_load(uint8_t value[ANIMATION_PREFERENCES_BYTES]) {memcpy(value,store,sizeof(store));return exists;}
bool animation_preferences_storage_save(const uint8_t value[ANIMATION_PREFERENCES_BYTES]) {writes++;if(failed)return false;memcpy(store,value,sizeof(store));exists=true;return true;}
int main(void)
{
    animation_preferences_init();assert(strcmp(animation_preferences_get()->id,"builtin")==0);assert(writes==0);
    assert(animation_id_valid("builtin"));assert(animation_id_valid("0123456789abcdef"));
    assert(!animation_id_valid("../secret"));assert(!animation_id_valid("ABCDEF0123456789"));assert(!animation_id_valid(""));
    assert(animation_preferences_select("0123456789abcdef",ANIMATION_SEQUENCE));assert(writes==1);
    animation_preferences_init();assert(strcmp(animation_preferences_get()->id,"0123456789abcdef")==0);assert(animation_preferences_get()->mode==ANIMATION_SEQUENCE);
    assert(animation_preferences_select("0123456789abcdef",ANIMATION_SEQUENCE));assert(writes==1);
    failed=true;assert(!animation_preferences_select("builtin",ANIMATION_SINGLE));assert(strcmp(animation_preferences_get()->id,"0123456789abcdef")==0);
    assert(!animation_preferences_select("../secret",ANIMATION_SINGLE));assert(!animation_preferences_select("builtin",(animation_mode_t)9));
    failed=false;store[5]^=1;animation_preferences_init();assert(strcmp(animation_preferences_get()->id,"builtin")==0);
    media_clip_t clips[2]={{.id="builtin",.label="ORIGINAL",.remote="/api/animations/assets/builtin/frames",.bytes=198*150*2*120,.crc=0,.width=198,.height=150,.x=145,.y=82,.fps=30},
        {.id="0123456789abcdef",.label="CLIP 02",.remote="/api/animations/assets/0123456789abcdef/frames",.bytes=198*150*2*15,.width=198,.height=150,.x=145,.y=82,.fps=30}};
    assert(media_clip_valid(&clips[0]));assert(media_clip_valid(&clips[1]));
    assert(media_catalog_next(clips,2,"builtin")==1);assert(media_catalog_next(clips,2,"0123456789abcdef")==0);
    assert(media_catalog_next(clips,2,"missing")==0);assert(media_catalog_next(clips,0,"builtin")==-1);assert(media_catalog_next(clips,9,"builtin")==-1);
    animation_preferences_t plan={"0123456789abcdef",ANIMATION_SINGLE};
    assert(media_catalog_start(clips,2,&plan)==1);
    plan.mode=ANIMATION_SEQUENCE;assert(media_catalog_start(clips,2,&plan)==0);
    /* Web reordering changes the queue start, independent of the saved ID. */
    media_clip_t reordered[]={clips[1],clips[0]};assert(media_catalog_start(reordered,2,&plan)==0);
    assert(strcmp(reordered[media_catalog_start(reordered,2,&plan)].id,"0123456789abcdef")==0);
    plan.mode=ANIMATION_SINGLE;snprintf(plan.id,sizeof(plan.id),"missing");assert(media_catalog_start(clips,2,&plan)==0);
    assert(media_catalog_start(clips,0,&plan)==-1);assert(media_catalog_start(clips,9,&plan)==-1);
    plan.mode=(animation_mode_t)9;assert(media_catalog_start(clips,2,&plan)==-1);
    /* One automatic session repeats one clip; preparation and previews never
     * mutate the last automatic ID. Advance only after a successful start. */
    plan.mode=ANIMATION_SEQUENCE;
    char last[ANIMATION_ID_BYTES]="";
    assert(media_catalog_session_start(clips,2,&plan,last)==0);
    assert(media_catalog_session_start(clips,2,&plan,last)==0);
    memcpy(last,clips[0].id,sizeof(last));
    assert(media_catalog_session_start(clips,2,&plan,last)==1);
    /* Previewing clip 0 leaves the next automatic target at clip 1. */
    assert(media_catalog_session_start(clips,2,&plan,last)==1);
    memcpy(last,clips[1].id,sizeof(last));
    assert(media_catalog_session_start(clips,2,&plan,last)==0);
    assert(media_catalog_session_start(clips,1,&plan,last)==0);
    assert(media_catalog_session_start(reordered,2,&plan,last)==1);
    assert(media_catalog_session_start(clips,2,&plan,"deleted")==0);
    assert(media_catalog_session_start(clips,2,&plan,NULL)==0);
    assert(media_catalog_session_start(clips,0,&plan,last)==-1);
    assert(media_catalog_session_start(clips,9,&plan,last)==-1);
    assert(media_catalog_session_start(clips,2,NULL,last)==-1);
    plan.mode=ANIMATION_SINGLE;snprintf(plan.id,sizeof(plan.id),"0123456789abcdef");
    assert(media_catalog_session_start(clips,2,&plan,last)==1);
    assert(media_catalog_session_start(clips,2,&plan,"builtin")==1);
    clips[1].bytes=MEDIA_MAX_BYTES+1;assert(!media_clip_valid(&clips[1]));
    clips[1].bytes=198*150*2;clips[1].width=480;assert(!media_clip_valid(&clips[1]));
    clips[1].width=198;snprintf(clips[1].remote,sizeof(clips[1].remote),"http://untrusted/frames");assert(!media_clip_valid(&clips[1]));
    puts("Animation preference persistence, failed-write preservation, bounds and catalog identity checks passed.");
    return 0;
}
