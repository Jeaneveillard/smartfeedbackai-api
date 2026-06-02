'use strict';
require('dotenv').config();

var STAR_MAP = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
var GBP_BASE = 'https://mybusiness.googleapis.com/v4';
var ACCT_MGT = 'https://mybusinessaccountmanagement.googleapis.com/v1';

async function gFetch(url, token, opts) {
  opts = opts || {};
  var res = await fetch(url, Object.assign({}, opts, {
    headers: Object.assign({ 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }, opts.headers || {})
  }));
  if (!res.ok) {
    var e = new Error('Google API error ' + res.status);
    e.status = res.status;
    throw e;
  }
  return res.json();
}

async function refreshAccessToken(refreshToken) {
  var res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    }).toString()
  });
  if (!res.ok) {
    var e = new Error('Token refresh failed ' + res.status);
    e.status = res.status;
    throw e;
  }
  return (await res.json()).access_token;
}

async function getAccounts(accessToken) {
  var data = await gFetch(ACCT_MGT + '/accounts', accessToken);
  return data.accounts || [];
}

async function getLocations(accessToken, accountId) {
  var data = await gFetch(ACCT_MGT + '/' + accountId + '/locations', accessToken);
  return data.locations || [];
}

async function getReviews(accessToken, accountId, locationId, pageToken) {
  var url = GBP_BASE + '/' + accountId + '/' + locationId + '/reviews?pageSize=50&orderBy=updateTime+desc';
  if (pageToken) url += '&pageToken=' + pageToken;
  var data = await gFetch(url, accessToken);
  var reviews = (data.reviews || []).map(function (r) {
    return {
      google_review_id: r.reviewId,
      author: r.reviewer ? r.reviewer.displayName : 'Anonyme',
      author_initials: r.reviewer
        ? r.reviewer.displayName.split(' ').map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase()
        : 'AN',
      rating: STAR_MAP[r.starRating] || 3,
      text: r.comment || '',
      date: r.createTime,
      source: 'google',
      status: r.reviewReply ? 'responded' : 'pending',
      response: r.reviewReply ? r.reviewReply.comment : null
    };
  });
  return { reviews: reviews, nextPageToken: data.nextPageToken || null };
}

async function postReply(accessToken, accountId, locationId, reviewId, comment) {
  return gFetch(
    GBP_BASE + '/' + accountId + '/' + locationId + '/reviews/' + reviewId + '/reply',
    accessToken,
    { method: 'PUT', body: JSON.stringify({ comment: comment }) }
  );
}

module.exports = { refreshAccessToken, getAccounts, getLocations, getReviews, postReply };
