'use strict';
const { getAccounts, getLocations, getReviews, postReply, refreshAccessToken } = require('../src/services/googleApi');

global.fetch = jest.fn();
afterEach(() => { jest.clearAllMocks(); });

describe('refreshAccessToken', () => {
  it('returns new access token from Google', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'new_token_123' })
    });
    const token = await refreshAccessToken('refresh_token_abc');
    expect(token).toBe('new_token_123');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://oauth2.googleapis.com/token',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('throws if Google returns error', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }) });
    await expect(refreshAccessToken('bad_refresh')).rejects.toThrow('400');
  });
});

describe('getAccounts', () => {
  it('returns list of accounts', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ accounts: [{ name: 'accounts/123', accountName: 'Le Bistro' }] })
    });
    const accounts = await getAccounts('access_token');
    expect(accounts).toHaveLength(1);
    expect(accounts[0].name).toBe('accounts/123');
  });
});

describe('getReviews', () => {
  it('maps Google star ratings to integers', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        reviews: [{
          reviewId: 'r1',
          reviewer: { displayName: 'Alice' },
          starRating: 'FIVE',
          comment: 'Excellent!',
          createTime: '2026-05-01T12:00:00Z',
          updateTime: '2026-05-01T12:00:00Z',
          reviewReply: null
        }]
      })
    });
    const { reviews } = await getReviews('token', 'accounts/123', 'locations/456');
    expect(reviews[0].rating).toBe(5);
    expect(reviews[0].google_review_id).toBe('r1');
    expect(reviews[0].status).toBe('pending');
  });

  it('marks review as responded when reviewReply exists', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        reviews: [{
          reviewId: 'r2',
          reviewer: { displayName: 'Bob' },
          starRating: 'THREE',
          comment: 'Correct.',
          createTime: '2026-05-01T12:00:00Z',
          updateTime: '2026-05-01T12:00:00Z',
          reviewReply: { comment: 'Merci !' }
        }]
      })
    });
    const { reviews } = await getReviews('token', 'accounts/123', 'locations/456');
    expect(reviews[0].status).toBe('responded');
    expect(reviews[0].response).toBe('Merci !');
  });
});

describe('postReply', () => {
  it('calls the correct Google endpoint', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ comment: 'Merci !', updateTime: '...' }) });
    await postReply('token', 'accounts/123', 'locations/456', 'reviewId789', 'Merci !');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('reviewId789/reply'),
      expect.objectContaining({ method: 'PUT' })
    );
  });

  it('throws on 429 rate limit', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({}) });
    await expect(postReply('token', 'a', 'l', 'r', 'text')).rejects.toThrow('429');
  });
});
