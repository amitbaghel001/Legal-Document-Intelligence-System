import axios from 'axios';

// POST to a Gemini endpoint with one retry on transient failures:
// - 429 = rate limited (RetryInfo gives a short wait; distinct from a
//   daily-quota exhaustion, which fails the same way regardless of retries)
// - 503 = model temporarily overloaded ("high demand"), Google's own docs
//   say this is transient and safe to retry after a short pause
export async function postGeminiWithRetry(url, payload, axiosConfig = {}) {
  try {
    return await axios.post(url, payload, axiosConfig);
  } catch (err) {
    const status = err.response?.status;
    if (status !== 429 && status !== 503) {
      throw err;
    }

    let retrySeconds = 5;
    if (status === 429) {
      const retryInfo = err.response.data?.error?.details?.find(
        d => d['@type']?.includes('RetryInfo')
      );
      retrySeconds = retryInfo ? parseInt(retryInfo.retryDelay) || 5 : 5;
    }

    await new Promise(resolve => setTimeout(resolve, retrySeconds * 1000));
    return axios.post(url, payload, axiosConfig);
  }
}
