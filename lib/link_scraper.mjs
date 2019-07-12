class IncorrectLinksSelector extends Error {
    constructor(...args) {
        super(...args);
    }
}

export const CONFIG = {
    sources: {
         google: {
             num_page_results: 100,
             links_selector: '#search a[ping]:not(.fl)',
             next_selector: '#pnnext',
             get_base_url: async (browser, search_operators_map) => {
                 const url = new URL('https://www.google.com/search');
                 url.searchParams.set('num', String(CONFIG.sources.google.num_page_results));
                 url.searchParams.set('q',
                     Object.entries(search_operators_map).reduce(
                         (accumulator, [key, value]) => accumulator + ` ${key}:${value}`,
                         ''
                     )                 );
                 url.searchParams.set('filter', '0');
                 return url.toString();
             }
         },
        bing: {
            num_page_results: 50,
            links_selector: '#b_results > li > h2 > a, #b_results > li > div > h2 > a',
            next_selector: 'a[title="Next page"]',
            get_base_url: async (browser, search_operators_map = {}) => {
                const url = new URL('https://www.bing.com/search');
                url.searchParams.set('count', String(CONFIG.sources.bing.num_page_results));
                url.searchParams.set(
                    'q',
                    Object.entries(search_operators_map).reduce(
                        (accumulator, [key, value]) => accumulator + ` ${key}:${value}`,
                        ''
                    )
                );

                return url.toString();
            }
        },
        // yahoo: {
        //     num_page_results: 50,
        //     links_selector: 'a.ac-algo',
        //     next_selector: 'a.next',
        //     pre: async (browser, page) => {
        //         await page.goto('https://se.search.yahoo.com');

        //         return Promise.all([
        //             page.waitForNavigation(),
        //             page.click('button[name="agree"]')
        //         ]);
        //     },
        //     get_base_url: async (browser, search_operators_map = {}) => {
        //         const url = new URL('https://se.search.yahoo.com/search');
        //         url.searchParams.set('pz', String(CONFIG.sources.yahoo.num_page_results));
        //         url.searchParams.set(
        //             'p',
        //             Object.entries(search_operators_map).reduce(
        //                 (accumulator, [key, value]) => accumulator + ` ${key}:${value}`,
        //                 ''
        //             )
        //         );

        //         return url.toString();
        //     }
        // }
    }
};

export async function scrape_links(browser, goto_url, pre, links_selector, next_selector, num_pages_limit = null) {
    const browser_context = await browser.createIncognitoBrowserContext();
    const page = await browser_context.newPage();
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8'
    });

    if (pre)
        await pre(browser, page);

    const links_set = new Set();

    let page_num = 0;
    while (goto_url !== '' && page_num !== num_pages_limit) {
        console.error(`Retrieving ${goto_url}...`);
        await page.goto(goto_url);

        const last_num_document_links = links_set.size;

        const [result_links, next_page_link] = await page.evaluate((links_selector, next_selector) => {
            const next_link_element = document.querySelector(next_selector);
            return [
                Array.from(document.querySelectorAll(links_selector)).map(a => a.href),
                next_link_element ? next_link_element.href : ''
            ];
        }, links_selector, next_selector);

        // Sanity check. If there is a next page, there should be result links on the current page.
        // If there are none, the links selector is wrong.
        if (next_page_link && result_links.length === 0)
            throw new IncorrectLinksSelector(`\x1b[31m${goto_url} -- ${links_selector}\x1b[0m`);

        result_links.forEach(link => links_set.add(link));

        if (links_set.size === last_num_document_links)
            break;

        goto_url = next_page_link;
        page_num++;
    }

    await page.close();
    await browser_context.close();

    return links_set
}
