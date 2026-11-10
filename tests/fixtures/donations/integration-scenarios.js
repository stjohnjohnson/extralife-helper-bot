// Synthetic participant campaign totals and gifts; no stream observations or real clients.
module.exports = [
    { name: 'ordinary', names: ['Alex Johnson'], startingCampaignCents: 90000, goalCents: 1000000, gifts: [2500], totalCents: 92500, kind: 'donation', durationMs: 15000, caption: '$25 - THANK YOU!' },
    { name: 'anonymous', startingCampaignCents: 90000, goalCents: 1000000, gifts: [2500], anonymous: true, totalCents: 92500, kind: 'donation', durationMs: 15000, caption: '$25 - THANK YOU!' },
    { name: 'batch', names: ['Casey', 'Jordan'], startingCampaignCents: 90000, goalCents: 1000000, gifts: [1000,1500], totalCents: 92500, kind: 'donation', durationMs: 30000, caption: '$10 - THANK YOU!; then $15 - THANK YOU!' },
    { name: 'milestone', startingCampaignCents: 249000, goalCents: 1000000, gifts: [1000], totalCents: 250000, kind: 'milestone', durationMs: 33000, caption: '$10 - THANK YOU!', partyCaption: '$2,500 RAISED!' },
    { name: 'large', startingCampaignCents: 249000, goalCents: 1000000, gifts: [106000], totalCents: 355000, kind: 'milestone', durationMs: 33000, caption: '$1,060 - THANK YOU!', partyCaption: '$3,550 RAISED!' },
    { name: 'goal', startingCampaignCents: 99000, goalCents: 100000, gifts: [1000], totalCents: 100000, kind: 'goal', durationMs: 35000, caption: '$10 - THANK YOU!', partyCaption: 'EXTRA LIFE GOAL REACHED!' },
    { name: 'hidden', names: ['Taylor'], startingCampaignCents: 90000, goalCents: 1000000, gifts: [null], totalCents: 92500, kind: 'donation', durationMs: 15000, caption: 'THANK YOU!' },
    { name: 'punctuation', names: ['Pat O\'Neil: "Hi",.-'], startingCampaignCents: 90000, goalCents: 1000000, gifts: [2500], totalCents: 92500, kind: 'donation', durationMs: 15000, caption: '$25 - THANK YOU!' },
    { name: 'long-name', names: ['A very long donation display name that needs shortening'], startingCampaignCents: 90000, goalCents: 1000000, gifts: [2500], totalCents: 92500, kind: 'donation', durationMs: 15000, caption: '$25 - THANK YOU!' }
];
