#include "ui_router.h"

#include <stddef.h>

static monitor_page_t fallback_page(const ui_router_t *router)
{
    const monitor_page_t order[] = {
        MONITOR_PAGE_OVERVIEW,
        MONITOR_PAGE_SYSTEM,
        MONITOR_PAGE_STUDY,
    };
    for (size_t index = 0; index < sizeof(order) / sizeof(order[0]); ++index) {
        if (ui_router_page_available(router, order[index])) return order[index];
    }
    return MONITOR_PAGE_OVERVIEW;
}

bool ui_router_page_available(const ui_router_t *router, monitor_page_t page)
{
    if (page == MONITOR_PAGE_SYSTEM) return router->show_cpu || router->show_memory;
    if (page == MONITOR_PAGE_STUDY) return router->show_exam;
    return router->show_cpu || router->show_memory || router->show_exam;
}

void ui_router_init(ui_router_t *router, const monitor_display_config_t *config)
{
    router->configured_page = config->page;
    router->show_cpu = config->show_cpu;
    router->show_memory = config->show_memory;
    router->show_exam = config->show_exam;
    router->active_page = ui_router_page_available(router, config->page)
        ? config->page
        : fallback_page(router);
}

bool ui_router_apply_config(ui_router_t *router, const monitor_display_config_t *config,
                            bool page_command_changed)
{
    monitor_page_t previous = router->active_page;
    router->show_cpu = config->show_cpu;
    router->show_memory = config->show_memory;
    router->show_exam = config->show_exam;
    if (page_command_changed && ui_router_page_available(router, config->page)) {
        router->active_page = config->page;
    } else if (!ui_router_page_available(router, router->active_page)) {
        router->active_page = fallback_page(router);
    }
    router->configured_page = config->page;
    return router->active_page != previous;
}

bool ui_router_set_page(ui_router_t *router, monitor_page_t page)
{
    if (page < MONITOR_PAGE_OVERVIEW || page > MONITOR_PAGE_STUDY ||
        !ui_router_page_available(router, page) || router->active_page == page) {
        return false;
    }
    router->active_page = page;
    return true;
}

bool ui_router_shift(ui_router_t *router, int direction)
{
    int candidate = (int)router->active_page;
    while (true) {
        candidate += direction;
        if (candidate < MONITOR_PAGE_OVERVIEW || candidate > MONITOR_PAGE_STUDY) return false;
        if (ui_router_set_page(router, (monitor_page_t)candidate)) return true;
    }
}
