#!/usr/bin/env -S node --experimental-modules

import fs from 'fs';

import puppeteer from 'puppeteer';
import ArgumentParser from 'argparse';

import {CONFIG as LINK_SCRAPER_CONFIG, scrape_links} from '../lib/link_scraper.mjs';

function get_argparser() {
    const parser = new ArgumentParser.ArgumentParser();

    parser.addArgument(
        ['domain'],
        {
            help: 'The domain which to scrape for path links.',
        }
    );

    parser.addArgument(
        [ '-o', '--output-file' ],
        {
            help: 'A file path at which a file listing the resulting links is to be created.',
            dest: 'output_file'
        }
    );

    parser.addArgument(
        [ '-s', '--sources' ],
        {
            help: `Sources from where to extract path links. Supported: ${Object.keys(LINK_SCRAPER_CONFIG.sources).join(', ')}. Default: (all).`,
            dest: 'sources',
            defaultValue: Object.keys(LINK_SCRAPER_CONFIG.sources),
            nargs: ArgumentParser.Const.ONE_OR_MORE
        }
    );

    parser.addArgument(
        ['-w', '--show-window'],
        {
            help: 'Display the Chrome browser window when scraping.',
            dest: 'show_window',
            action: 'storeTrue'
        }
    );

    return parser;
}

async function main() {
    const args = get_argparser().parseArgs();
    const browser = await puppeteer.launch({headless: !args.show_window});

    const links = await (async () => {
        let links = new Set();

        for (const source of args.sources) {
            const source_config = LINK_SCRAPER_CONFIG.sources[source];
            try {
                links = new Set([
                    ...Array.from(await scrape_links(
                        browser,
                        await source_config.get_base_url(browser, {site: args.domain}),
                        source_config.pre,
                        source_config.links_selector,
                        source_config.next_selector,
                    )).map(link => {
                        const {pathname, search} = new URL(link);
                        return `${pathname}${search}`;
                    }),
                    ...links
                ]);
            } catch (err) {
                console.error(err);
            }
        }

        return links;
    })();

    console.error(`Retrieved ${links.size} unique paths.`);

    try {
        const output_data = Array.from(links).join('\n');
        if (args.output_file) {
            await fs.promises.writeFile(args.output_file, output_data + (links.size > 0 ? '\n' : ''));
        } else {
            console.log(output_data)
        }
    } catch (err) {
        console.error(err);
    } finally {
        await browser.close();
    }
}

main()
    .then(() => {
        process.exit(0);
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    })
;

