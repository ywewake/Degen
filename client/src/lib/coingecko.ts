export async function fetchDirect(url: string): Promise<Response> {
  try {
    const res = await fetch(url, { 
      headers: { Accept: 'application/json' } 
    });
    
    if (res.ok) return res;
    
    if (res.status === 429 || res.status === 403) {
      throw new Error('Rate limit reached. Please wait 30 seconds and try again.');
    }
    throw new Error(`API error: ${res.status}`);
  } catch (e) {
    if (e instanceof Error && (e.message.includes('rate limit') || e.message.includes('API error'))) {
      throw e;
    }
    throw new Error('Network error. Check your connection and try again.');
  }
}
