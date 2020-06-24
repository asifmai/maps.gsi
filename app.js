const pupHelper = require('./puppeteerhelper');
const moment = require('moment');
const pLimit = require('p-limit');
const fs = require('fs');
const {siteLink, concurrency} = require('./keys');
let browser;
let samples;
const locations = [];

const run = () => new Promise(async (resolve, reject) => {
  try {
    await readSamples();
    browser = await pupHelper.launchBrowser();

    let promises = [];
    const limit = pLimit(concurrency);

    for (let i = 0; i < samples.length; i++) {
      // await fetchFromText(i);
      promises.push(limit(() => fetchFromText(i)));
    }
    await Promise.all(promises);

    console.log(`Fetched ${locations.length} Records...`);
    fs.writeFileSync(`${moment().format('YYYY-MM-DD HH-mm')}.json`, JSON.stringify(locations));
    
    await browser.close();
    
    resolve(true);
  } catch (error) {
    if (browser) await browser.close();
    console.log('Run Error: ', error);
    reject(error);
  }
});

const readSamples = () => new Promise(async (resolve, reject) => {
  try {
    samples = fs.readFileSync('sample.txt', 'utf8');
    samples = samples.split('\n');
    samples = samples.filter(sm => sm !== '');
    samples = samples.map(sm => {
      let newSm = sm;
      if (sm.startsWith('"')) newSm = newSm.replace(/^"/gi, '').trim();
      if (sm.endsWith('"')) newSm = newSm.replace(/"$/gi, '').trim();
      return newSm;
    });

    console.log(`Got ${samples.length} Entries in sample.txt...`);

    resolve(true);
  } catch (error) {
    console.log('readSamples Error: ', error);
    reject(error);
  }
});

const fetchFromText = (sampleIdx) => new Promise(async (resolve, reject) => {
  let page;
  try {
    console.log(`${sampleIdx+1}/${samples.length} - Fetching for Text: ${samples[sampleIdx]}`);
    page = await pupHelper.launchPage(browser);
    const response = await page.goto(siteLink, {timeout: 0, waitUntil: 'load'});

    await page.waitForSelector('form#search_f > input#query');
    await page.type('form#search_f > input#query', samples[sampleIdx], {delay: 50});
    await page.keyboard.press('Enter');

    await page.waitForSelector('.gsi_dialog ul.searchresultdialog_ul > li > a');

    const locationsNodes = await page.$$('.gsi_dialog ul.searchresultdialog_ul > li > a');

    for (let i = 0; i < locationsNodes.length; i++) {
      const location = {
        searchTerm: samples[sampleIdx]
      };

      // console.log(`${i+1}/${locationsNodes.length} - Fetching Details for Location...`)
      await page.evaluate((loc) => loc.click(), locationsNodes[i]);
      await page.waitFor(5000);
      const pageUrl = await page.url();
      const urlSplit = pageUrl.split('/');
      location.lat = urlSplit[4];
      location.long = urlSplit[5];
      await page.waitForSelector('span.elevation');
      location.elevation = await pupHelper.getTxt('span.elevation', page);

      locations.push(location);
    }

    await page.close();
    resolve(true);
  } catch (error) {
    if (page) await page.close();
    console.log(`Run Error: ${error}`);
    reject(error);
  }
})

run();