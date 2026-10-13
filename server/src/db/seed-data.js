// Demo data loaded on first run.
//
// The claims are SYNTHETIC: written for this demo and modelled on well-documented,
// debunked misinformation narratives. Authors and handles are fictional, and the
// datasets are labelled by the kind of public source they imitate. Replace or
// extend this with real exports through the Ingest page or the bulk import API.

export const datasets = [
  { slug: 'facebook-pages', name: 'Facebook public pages export', kind: 'social', description: 'Posts from public pages and groups exported for research.' },
  { slug: 'x-posts', name: 'X (Twitter) public posts sample', kind: 'social', description: 'A sample of public posts collected through the research API.' },
  { slug: 'reddit-comments', name: 'Reddit comments corpus', kind: 'forum', description: 'Public comments from discussion threads.' },
  { slug: 'telegram-channels', name: 'Telegram public channels', kind: 'messaging', description: 'Messages from public broadcast channels.' },
  { slug: 'whatsapp-tipline', name: 'WhatsApp tipline submissions', kind: 'messaging', description: 'Forwarded messages that users sent to a fact-checking tipline.' },
  { slug: 'youtube-transcripts', name: 'YouTube video transcripts', kind: 'video', description: 'Auto-generated transcripts of public videos.' },
  { slug: 'news-blogs', name: 'Online news and blogs corpus', kind: 'news', description: 'Articles from news sites, magazines and blogs.' },
  { slug: 'claimreview', name: 'Fact-check archive (ClaimReview)', kind: 'fact-check', description: 'Claims logged by fact-checkers in ClaimReview markup.' },
];

export const narratives = [
  {
    key: '5g',
    title: '5G networks cause or spread COVID-19',
    summary: 'Fears about radiation from new 5G towers fused with the early pandemic into claims that 5G creates or spreads the coronavirus.',
    category: 'Technology & health',
    verdict: 'false',
    fact_check: 'Radio waves cannot create or carry viruses. COVID-19 spread widely in countries that had no 5G network at all.',
  },
  {
    key: 'hot-water',
    title: 'Hot water and salt-water gargles kill the coronavirus',
    summary: 'Ordinary sore-throat advice mutated into viral messages promising that gargling or hot drinks wash away or kill the virus.',
    category: 'Health',
    verdict: 'false',
    fact_check: 'Warm drinks and salt-water gargles can soothe a sore throat, but they do not kill, flush out or prevent SARS-CoV-2.',
  },
  {
    key: 'microchip',
    title: 'COVID-19 vaccines contain tracking microchips',
    summary: 'Research on injectable vaccination records turned into claims of hidden chips, 5G tracking and magnetic injection sites.',
    category: 'Health & technology',
    verdict: 'false',
    fact_check: 'Vaccine ingredients are published and contain no electronics. A working chip would not fit through a vaccine needle or run without power.',
  },
  {
    key: 'volcano',
    title: 'Volcanoes emit more CO2 than humans',
    summary: 'A true fact about large eruptions inflated step by step until volcanoes supposedly dwarf all human emissions.',
    category: 'Climate',
    verdict: 'false',
    fact_check: 'Human activity emits roughly 100 times more carbon dioxide each year than all of the world’s volcanoes combined.',
  },
  {
    key: 'lemon',
    title: 'Hot lemon water and baking soda cure cancer',
    summary: 'Basic nutrition facts about lemons grew into miracle-cure chain messages with invented authorities and numbers.',
    category: 'Health',
    verdict: 'false',
    fact_check: 'No clinical evidence shows that lemons, baking soda or an “alkaline” diet cure cancer. Food cannot change the blood’s pH.',
  },
  {
    key: 'moon',
    title: 'The Apollo moon landings were staged',
    summary: 'Puzzles about photos and video from Apollo 11 recombined over a decade into a full studio-hoax story.',
    category: 'Science & history',
    verdict: 'false',
    fact_check: 'Independent tracking stations, retroreflectors left on the surface and orbiter photos of the landing sites all confirm the landings.',
  },
  {
    key: 'haarp',
    title: 'HAARP controls the weather and steers typhoons',
    summary: 'An atmospheric research station became the supposed cause of typhoons, floods and earthquakes, with a strong Philippine thread.',
    category: 'Climate & weather',
    verdict: 'false',
    fact_check: 'HAARP studies the ionosphere, far above where weather forms. Its transmitters cannot create, strengthen or steer storms or earthquakes.',
  },
];

// [narrative key, published date, dataset slug, author, region (ISO 3166-1), reach, text]
const rows = [
  // 5G
  ['5g', '2019-11-04', 'facebook-pages', 'Safe Tech Awareness (page)', 'US', 4200, 'New 5G towers emit radiation that weakens the immune system and makes people sick.'],
  ['5g', '2020-01-22', 'x-posts', '@lightworker_jen', 'US', 8100, '5G radiation suppresses your immune system, which is why the coronavirus is spreading so fast.'],
  ['5g', '2020-01-28', 'telegram-channels', 'Awake Channel', 'GB', 15600, 'Wuhan was the first city with full 5G coverage, and that is exactly where the coronavirus outbreak started. Coincidence?'],
  ['5g', '2020-02-05', 'youtube-transcripts', 'TruthFrequency TV', 'US', 52300, 'The coronavirus is not a virus at all. The symptoms are caused by radiation from the new 5G towers.'],
  ['5g', '2020-03-02', 'facebook-pages', 'Wake Up Britain (group)', 'GB', 21900, 'Countries with 5G have far more coronavirus cases than countries without it. Compare the maps yourself.'],
  ['5g', '2020-03-18', 'whatsapp-tipline', 'Forwarded message', 'NG', 33000, 'Scientists confirm 5G towers spread COVID-19. Turn off your phone at night to stay safe! Forward to all your groups.'],
  ['5g', '2020-03-26', 'x-posts', '@patriot_mom_ky', 'US', 12700, 'They installed 5G towers in schools while everyone was in lockdown. Share this before it gets deleted!'],
  ['5g', '2020-04-02', 'news-blogs', 'HealthTruth Daily (blog)', 'US', 9800, 'Telecom engineers admit the 60GHz 5G frequency stops your blood from absorbing oxygen, causing coronavirus symptoms.'],
  ['5g', '2020-04-09', 'facebook-pages', 'Kalusugan Muna (page)', 'PH', 18400, '60GHz 5G waves stop your blood from absorbing oxygen. That is why coronavirus patients cannot breathe.'],
  ['5g', '2020-04-14', 'telegram-channels', 'Naija Truth Feed', 'NG', 7600, '5G towers were switched on in Lagos during the lockdown, and now coronavirus cases are rising.'],
  ['5g', '2020-04-21', 'reddit-comments', 'u/redpill_rising', 'US', 3100, '100% of coronavirus hotspots are 5G cities. Wake up people.'],
  ['5g', '2020-05-07', 'whatsapp-tipline', 'Forwarded message', 'PH', 26700, 'Doctors in Manila warn that 5G radiation causes breathing problems that hospitals are calling COVID.'],
  ['5g', '2020-06-11', 'claimreview', 'Fact-check desk', 'GB', 1400, 'Claim: 5G mobile networks spread the coronavirus.'],

  // Hot water / salt water
  ['hot-water', '2019-12-02', 'news-blogs', 'Everyday Wellness Magazine', 'US', 2600, 'Gargling warm salt water can help soothe a sore throat during a cold.'],
  ['hot-water', '2020-01-29', 'facebook-pages', 'Natural Remedies PH (page)', 'PH', 9300, 'Gargling warm salt water or vinegar eliminates the coronavirus from your throat.'],
  ['hot-water', '2020-02-14', 'whatsapp-tipline', 'Forwarded message', 'IN', 41200, 'Doctors say the coronavirus stays in the throat for 4 days before it reaches the lungs. Gargle with warm salt water to kill it.'],
  ['hot-water', '2020-02-27', 'whatsapp-tipline', 'Forwarded message', 'IN', 38600, 'The coronavirus stays in your throat for 4 days. Drinking hot water every 15 minutes washes it into your stomach where the acid kills it.'],
  ['hot-water', '2020-03-08', 'facebook-pages', 'Healthy Living Tips (page)', 'US', 64100, 'Stanford doctors confirm: drinking hot water every 15 minutes kills 100% of the coronavirus. Share with everyone you love!'],
  ['hot-water', '2020-03-10', 'x-posts', '@dailyhealthtips', 'US', 22400, 'Stanford doctors: hold your breath for 10 seconds every morning. If you can do it without coughing, you do not have the coronavirus. Drink hot water every 15 minutes.'],
  ['hot-water', '2020-03-15', 'telegram-channels', 'Afya Bora Updates', 'KE', 11800, 'The coronavirus cannot survive temperatures above 26 degrees. Drink hot water and sit in the sun to kill it.'],
  ['hot-water', '2020-03-21', 'facebook-pages', 'Mzansi Health Watch (group)', 'ZA', 14300, 'Hot drinks and sunlight kill the coronavirus. The health ministry advises drinking warm water every 20 minutes.'],
  ['hot-water', '2020-04-03', 'whatsapp-tipline', 'Forwarded message', 'PH', 19900, 'Gargle with warm salt water 3 times a day and you will never catch the coronavirus.'],
  ['hot-water', '2020-04-19', 'youtube-transcripts', 'Saúde Natural Canal', 'BR', 8700, 'Drinking hot water with lemon every hour kills the coronavirus in your throat before it reaches your lungs.'],
  ['hot-water', '2020-05-02', 'claimreview', 'Fact-check desk', 'US', 1100, 'Claim: drinking hot water every 15 minutes protects you from the coronavirus.'],

  // Vaccine microchips
  ['microchip', '2019-12-18', 'news-blogs', 'Science Wire Digest', 'US', 3900, 'Researchers are developing an injectable dye that can store vaccination records under the skin.'],
  ['microchip', '2020-03-30', 'facebook-pages', 'Parents Ask Questions (group)', 'US', 6800, 'New vaccines will contain an invisible ink that records data under your skin.'],
  ['microchip', '2020-05-12', 'youtube-transcripts', 'The Unfiltered Hour', 'US', 47100, 'The coming COVID vaccine contains a microchip that records your data under your skin.'],
  ['microchip', '2020-05-25', 'x-posts', '@freedomfirst_76', 'US', 28400, 'The COVID vaccine contains a microchip that tracks your location through 5G.'],
  ['microchip', '2020-07-08', 'telegram-channels', 'Freie Stimme Kanal', 'DE', 17200, 'Hidden microchips in the vaccine let governments track every vaccinated person. Share before they delete this!'],
  ['microchip', '2020-09-14', 'telegram-channels', 'Freie Stimme Kanal', 'DE', 9100, 'Microchips in the vaccine are activated by 5G towers to control your behavior.'],
  ['microchip', '2021-03-03', 'reddit-comments', 'u/ledger_of_truth', 'US', 5300, 'A patent proves the vaccine microchip will be used for digital ID and cryptocurrency payments.'],
  ['microchip', '2021-05-11', 'youtube-transcripts', 'Kitchen Table Science', 'US', 88200, 'After the jab your arm becomes magnetic because of the microchip. Try putting a coin on it!'],
  ['microchip', '2021-05-19', 'facebook-pages', 'Pinoy Health Alert (page)', 'PH', 23700, 'Vaccinated people have magnetic arms. Magnets stick to the injection site because of the metal chip.'],
  ['microchip', '2021-06-02', 'whatsapp-tipline', 'Forwarded message', 'MY', 15400, 'Scan the vaccine injection site with your phone Bluetooth and you will see a device address. That is the microchip.'],
  ['microchip', '2021-06-16', 'x-posts', '@nurse_truths', 'US', 19800, 'Nurses confirm the vaccine microchip shows up as a Bluetooth device on your phone.'],
  ['microchip', '2021-07-01', 'claimreview', 'Fact-check desk', 'US', 1300, 'Claim: COVID-19 vaccines contain microchips that make people’s arms magnetic.'],

  // Volcanoes vs human CO2
  ['volcano', '2016-04-11', 'news-blogs', 'Earth Science Notes (blog)', 'GB', 1900, 'A large volcanic eruption can release millions of tonnes of carbon dioxide into the atmosphere.'],
  ['volcano', '2017-09-05', 'facebook-pages', 'Climate Common Sense (page)', 'US', 7400, 'One volcanic eruption releases more carbon dioxide than humans have produced in a century.'],
  ['volcano', '2018-02-20', 'x-posts', '@climate_realist', 'US', 13100, 'A single volcano emits more CO2 in a day than all the cars in the world do in a year.'],
  ['volcano', '2018-11-08', 'reddit-comments', 'u/northern_skeptic', 'CA', 4800, 'Volcanoes produce more CO2 than all human activity combined, so cutting emissions is pointless.'],
  ['volcano', '2019-06-17', 'youtube-transcripts', 'Outback Thinker', 'AU', 31600, 'Underwater volcanoes release 100 times more CO2 than humans, and scientists hid it from you.'],
  ['volcano', '2019-10-02', 'facebook-pages', 'Bayan Ko Facts (page)', 'PH', 12500, 'Mount Pinatubo emitted more carbon dioxide than humans did in all of history.'],
  ['volcano', '2020-08-24', 'news-blogs', 'Liberty Science Post (blog)', 'US', 6100, 'Geologists admit volcanic CO2 emissions dwarf human emissions by 50 times.'],
  ['volcano', '2021-01-13', 'telegram-channels', 'Klima Wahrheit', 'DE', 8800, 'Volcanoes emit more carbon dioxide than humans, which proves climate change is natural.'],
  ['volcano', '2022-01-20', 'x-posts', '@pacific_watch', 'AU', 19700, 'The Hunga Tonga eruption released more carbon dioxide than humanity has emitted since 1900.'],
  ['volcano', '2022-06-09', 'facebook-pages', 'Climate Common Sense (page)', 'US', 10300, 'Cutting car emissions is pointless when one volcano emits more CO2 than every car on Earth.'],
  ['volcano', '2023-03-15', 'claimreview', 'Fact-check desk', 'US', 900, 'Claim: volcanoes emit more carbon dioxide than human activities.'],

  // Lemon / baking soda cancer cure
  ['lemon', '2015-02-03', 'news-blogs', 'Good Food Weekly', 'GB', 2200, 'Lemons are rich in vitamin C, which supports a healthy immune system.'],
  ['lemon', '2016-07-19', 'facebook-pages', 'Natural Cures Daily (page)', 'US', 58200, 'Hot lemon water kills cancer cells and is 10,000 times stronger than chemotherapy.'],
  ['lemon', '2017-01-24', 'facebook-pages', 'Natural Cures Daily (page)', 'US', 34400, 'Lemon is 10,000 times stronger than chemo. The drug companies have hidden this for years.'],
  ['lemon', '2017-05-30', 'whatsapp-tipline', 'Forwarded message', 'IN', 27800, 'Drinking baking soda with lemon makes your body alkaline, and cancer cannot survive in an alkaline body.'],
  ['lemon', '2017-10-11', 'x-posts', '@alkaline_life', 'US', 9900, 'Cancer cannot survive in an alkaline body. Drink lemon and baking soda every morning to cure it.'],
  ['lemon', '2018-03-06', 'facebook-pages', 'Lunas sa Bahay (page)', 'PH', 46300, 'A top university hospital confirms hot lemon water cures cancer. Share this with everyone you love.'],
  ['lemon', '2018-08-22', 'youtube-transcripts', 'Saúde Natural Canal', 'BR', 21700, 'Frozen lemons cure cancer. Grate a whole frozen lemon over your food every day.'],
  ['lemon', '2019-04-15', 'telegram-channels', 'Wellness Underground', 'GB', 12600, 'Hot lemon water kills cancer cells in 7 days and doctors are shocked.'],
  ['lemon', '2019-11-26', 'news-blogs', 'Holistic Herald (blog)', 'IT', 7900, 'Baking soda injections cure tumors in 3 weeks, an Italian doctor proved it.'],
  ['lemon', '2020-09-08', 'facebook-pages', 'Naija Natural Health (page)', 'NG', 11200, 'Alkaline water with lemon prevents cancer and reverses diabetes.'],
  ['lemon', '2021-02-17', 'claimreview', 'Fact-check desk', 'US', 800, 'Claim: hot lemon water cures cancer.'],

  // Moon landing
  ['moon', '2009-07-20', 'news-blogs', 'Space History Archive', 'US', 3100, 'Photos from the Apollo 11 moon landing show no stars in the black sky.'],
  ['moon', '2010-03-14', 'reddit-comments', 'u/grassy_knoll_99', 'US', 2900, 'There are no stars in the Apollo moon photos because they were taken in a studio.'],
  ['moon', '2011-08-02', 'youtube-transcripts', 'Question Everything TV', 'US', 41500, 'The flag is waving in the moon landing video, but there is no wind on the moon. It was filmed on Earth.'],
  ['moon', '2012-05-09', 'facebook-pages', 'History They Hid (page)', 'US', 16300, 'The American flag waves on the moon even though there is no air. Proof the landing was staged in a studio.'],
  ['moon', '2013-02-26', 'youtube-transcripts', 'Question Everything TV', 'GB', 28800, 'A famous film director secretly filmed the moon landing in a studio in 1969.'],
  ['moon', '2014-09-17', 'news-blogs', 'Liberty Science Post (blog)', 'US', 9400, 'NASA admits the original moon landing tapes were erased because they would expose the hoax.'],
  ['moon', '2015-06-04', 'reddit-comments', 'u/lens_flare_lou', 'CA', 6200, 'Shadows in the moon landing photos point in different directions, proving studio lighting was used.'],
  ['moon', '2017-11-12', 'youtube-transcripts', 'Outback Thinker', 'AU', 37200, 'The Van Allen radiation belts would have killed the astronauts, so the moon landing must be fake.'],
  ['moon', '2019-07-16', 'x-posts', '@deep_space_doubt', 'US', 14100, 'Astronauts could never have survived the Van Allen belts. 100% proof the moon landing was faked.'],
  ['moon', '2019-07-21', 'facebook-pages', 'Bayan Ko Facts (page)', 'PH', 22600, 'No stars, a waving flag and impossible shadows: the moon landing was filmed in a Nevada desert studio.'],
  ['moon', '2020-02-11', 'claimreview', 'Fact-check desk', 'US', 700, 'Claim: the Apollo moon landing was filmed in a studio.'],

  // HAARP
  ['haarp', '2013-08-05', 'news-blogs', 'Science Wire Digest', 'US', 2400, 'The HAARP research facility in Alaska studies the upper atmosphere using high-frequency radio waves.'],
  ['haarp', '2013-10-22', 'facebook-pages', 'Sky Watchers United (group)', 'US', 9800, 'HAARP uses radio waves to heat the atmosphere and can change the weather.'],
  ['haarp', '2013-11-09', 'facebook-pages', 'Gising Pilipinas (page)', 'PH', 52700, 'Super Typhoon Haiyan was created by HAARP to test weather weapons on the Philippines.'],
  ['haarp', '2013-11-12', 'x-posts', '@stormtruther', 'US', 18600, 'HAARP can create hurricanes and steer them toward specific countries.'],
  ['haarp', '2014-07-15', 'youtube-transcripts', 'Kalayaan Files', 'PH', 33100, 'Leaked documents show the military steers typhoons with HAARP radio waves.'],
  ['haarp', '2015-03-03', 'reddit-comments', 'u/contrail_counter', 'US', 7200, 'Chemtrails and HAARP work together to control rainfall and cause floods.'],
  ['haarp', '2016-04-17', 'facebook-pages', 'Ecuador Despierta (group)', 'EC', 15300, 'Strange rainbow clouds appeared before the earthquake. Proof that HAARP triggered it.'],
  ['haarp', '2016-11-21', 'youtube-transcripts', 'Question Everything TV', 'US', 24400, 'HAARP can trigger earthquakes with radio waves. Scientists warned about this decades ago.'],
  ['haarp', '2020-11-01', 'facebook-pages', 'Gising Pilipinas (page)', 'PH', 29200, 'Weather weapons like HAARP are steering typhoons into the Philippines on purpose.'],
  ['haarp', '2024-10-24', 'x-posts', '@bagyo_watch', 'PH', 41800, 'Every major typhoon this year was engineered by HAARP. Look at the strange rings on the radar!'],
  ['haarp', '2024-11-08', 'claimreview', 'Fact-check desk', 'PH', 1200, 'Claim: HAARP created and steered typhoons toward the Philippines.'],
];

export const claims = rows.map(([narrative, date, dataset, author, region, reach, text]) => ({
  narrative,
  published_at: `${date}T08:00:00Z`,
  dataset,
  author,
  region,
  reach,
  text,
}));

// Example inputs offered on the Ingest and Compare pages.
export const examples = {
  ingest: [
    {
      label: '5G variant',
      text: 'They put up a 5G mast in our barangay and now everyone nearby has coronavirus symptoms.',
      dataset: 'facebook-pages',
      region: 'PH',
    },
    {
      label: 'Microchip variant',
      text: 'The booster jab hides a microchip so the government can track where you go.',
      dataset: 'telegram-channels',
      region: 'US',
    },
    {
      label: 'Hot-water variant',
      text: 'Drink warm water every 10 minutes to flush the coronavirus out of your throat.',
      dataset: 'whatsapp-tipline',
      region: 'ID',
    },
    {
      label: 'Brand-new claim',
      text: 'Eating raw papaya leaves overnight cures dengue fever completely.',
      dataset: 'facebook-pages',
      region: 'PH',
    },
  ],
};
