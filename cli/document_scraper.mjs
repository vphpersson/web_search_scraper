#!/usr/bin/env -S node --experimental-modules

import fs from 'fs';

import puppeteer from 'puppeteer';
import ArgumentParser from 'argparse';

import {CONFIG as LINK_SCRAPER_CONFIG, scrape_links} from '../lib/link_scraper.mjs';

const CONFIG = {
    file_types: ['pdf', 'docx', 'xlsx', 'pptx', 'doc', 'xls', 'ppt']
};

function get_argparser() {
    const parser = new ArgumentParser.ArgumentParser();

    parser.addArgument(
        ['domain'],
        {
            help: 'The domain which to scrape for document links.',
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
        [ '-f', '--file-types' ],
        {
            help: `A list of files types to retrieve links. Default: ${CONFIG.file_types.join(', ')}.`,
            dest: 'file_types',
            defaultValue: CONFIG.file_types,
            nargs: ArgumentParser.Const.ONE_OR_MORE,

        }
    );

    parser.addArgument(
        [ '-s', '--sources' ],
        {
            help: `Sources from where to extract document links. Supported: ${Object.keys(LINK_SCRAPER_CONFIG.sources).join(', ')}. Default: (all).`,
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

    const all_document_links = await (async () => {
        let all_document_links = new Set();

        for (const source of args.sources) {
            const source_config = LINK_SCRAPER_CONFIG.sources[source];
            for (const file_type of args.file_types) {
                try {
                    all_document_links = new Set([
                        ...await scrape_links(
                            browser,
                            await source_config.get_base_url(browser, {site: args.domain, filetype: file_type}),
                            source_config.pre,
                            source_config.links_selector,
                            source_config.next_selector
                        ),
                        ...all_document_links
                    ]);
                } catch (err) {
                    console.error(err);
                }
            }
        }

        return all_document_links;
    })();

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
