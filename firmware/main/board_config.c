#include "board_config.h"

/*
 * This translation unit keeps board definitions in the component so that
 * application code never hard-codes GPIO numbers. The vendor's LVGL display
 * and touch port is intentionally not copied here: it must be independently
 * reimplemented or imported only after license review.
 */
