#!/usr/bin/node --experimental-modules

import fs from 'fs';

import puppeteer from 'puppeteer';
import ArgumentParser from 'argparse';

class IncorrectLinksSelector extends Error {
    constructor(...args) {
        super(...args);
    }
}


const CONFIG = {
    file_types: ['pdf', 'docx', 'xlsx', 'pptx', 'doc', 'xls', 'ppt'],
    sources: {
        // google: {
        //     num_page_results: 100,
        //     links_selector: '#search a[ping]:not(.fl)',
        //     next_selector: '#pnnext',
        //     get_base_url: async (browser, domain, file_type) => {
        //         const url = new URL('https://www.google.com/search');
        //         url.searchParams.set('num', String(CONFIG.sources.google.num_page_results));
        //         url.searchParams.set('q', `site:${domain} filetype:${file_type}`);
        //         url.searchParams.set('filter', '0');
        //         // return url.toString();
        //
        //         const page = await browser.newPage();
        //         await page.goto('https://nl.hideproxy.me');
        //
        //         const navigation_promise = page.waitForNavigation();
        //
        //         const url_input = await page.$('input[placeholder="Enter website address"]');
        //         await url_input.type(url.toString());
        //
        //         await url_input.press('Enter');
        //         await navigation_promise;
        //
        //         await delay(5000);
        //
        //         const page_url = await page.url();
        //
        //         // await page.close();
        //
        //         return page_url;
        //     }
        // },
        bing: {
            num_page_results: 50,
            links_selector: '#b_results > li > h2 > a',
            next_selector: 'a[title="Next page"]',
            get_base_url: async (browser, domain, file_type) => {
                const url = new URL('https://www.bing.com/search');
                url.searchParams.set('count', String(CONFIG.sources.bing.num_page_results));
                url.searchParams.set('q', `site:${domain} filetype:${file_type}`);

                return url.toString();
            }
        },
        yahoo: {
            num_page_results: 50,
            links_selector: 'a.ac-algo',
            next_selector: 'a.next',
            pre: async (browser, page) => {
                await page.goto('https://se.search.yahoo.com');

                return Promise.all([
                    page.waitForNavigation(),
                    page.click('button[name="agree"]')
                ]);
            },
            get_base_url: async (browser, domain, file_type) => {
                const url = new URL('https://se.search.yahoo.com/search');
                url.searchParams.set('pz', String(CONFIG.sources.yahoo.num_page_results));
                url.searchParams.set('p', `site:${domain} filetype:${file_type}`);

                return url.toString();
            }
        }
    }
};

async function scrape_document_links(browser, domain, file_types, source) {
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8'
    });

    const source_config = CONFIG.sources[source];

    if ('pre' in source_config)
        await source_config.pre(browser, page);

    const document_links_set = new Set();

    for (const file_type of file_types) {
        for (let goto_url = await source_config.get_base_url(browser, domain, file_type); goto_url !== '';) {
            console.error(`Retrieving ${goto_url}...`);
            await page.goto(goto_url);

            const last_num_document_links = document_links_set.size;

            const [result_links, next_page_link] = await page.evaluate((links_selector, next_selector) => {
                const next_link_element = document.querySelector(next_selector);
                return [
                    Array.from(document.querySelectorAll(links_selector)).map(a => a.href),
                    next_link_element ? next_link_element.href : ''
                ];
            }, source_config.links_selector, source_config.next_selector);

            // Sanity check. If there is a next page, there should be result links on the current page.
            // If there are none, the links selector is wrong.
            if (next_page_link && result_links.length === 0)
                throw IncorrectLinksSelector(`${source} -- ${source_config.links_selector}`);

            result_links.forEach(link => document_links_set.add(link));

            if (document_links_set.size === last_num_document_links)
                break;

            goto_url = next_page_link;
        }
    }

    await page.close();

    return document_links_set
}

function get_argparser() {
    const parser = new ArgumentParser.ArgumentParser();

    parser.addArgument(
        ['domain'],
        {
            help: 'The domain which to scrape for document links.',
        }
    );

    // parser.addArgument(
    //     [ '-o', '--output-file' ],
    //     {
    //         help: 'The output directory where the screenshots are to be saved.',
    //         dest: 'output_file'
    //     }
    // );

    parser.addArgument(
        [ '-f', '--file-types' ],
        {
            help: `A list of files types to retrieve links. Supported: ${CONFIG.file_types.join(', ')}. Default: (all).`,
            dest: 'file_types',
            defaultValue: CONFIG.file_types,
            nargs: ArgumentParser.Const.ONE_OR_MORE,

        }
    );

    parser.addArgument(
        [ '-s', '--sources' ],
        {
            help: `Sources from where to extract document links. Supported: ${Object.keys(CONFIG.sources).join(', ')}. Default: (all).`,
            dest: 'sources',
            defaultValue: Object.keys(CONFIG.sources),
            nargs: ArgumentParser.Const.ONE_OR_MORE
        }
    );

    return parser;
}

(async () => {
    const args = get_argparser().parseArgs();

    const browser = await puppeteer.launch({headless: true});
    let all_document_links = new Set();

    for (const source of args.sources) {
        try {
            all_document_links = new Set([
                ...await scrape_document_links(
                    browser,
                    args.domain,
                    args.file_types,
                    source
                ),
                ...all_document_links
            ]);
        } catch (err) {
            console.error(err);
        }
    }

    console.error(`Retrieved ${all_document_links.size} unique document links.`);

    try {
        const output_data = Array.from(all_document_links).join('\n');
        if (args.output_file) {
            await fs.promises.writeFile(args.output_file, output_data + (all_document_links.size > 0 ? '\n' : ''));
        } else {
            console.log(output_data)
        }
    } catch (err) {
        console.error(err);
    }

    await browser.close();
})();
