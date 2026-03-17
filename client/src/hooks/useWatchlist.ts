import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export function useWatchlist(userId: string | undefined) {
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;

    const fetchWatchlist = async () => {
      const { data, error } = await supabase
        .from('watchlists')
        .select('coin_id')
        .eq('user_id', userId);

      if (!error && data) {
        setWatchlist(data.map(item => item.coin_id));
      }
      setLoading(false);
    };

    fetchWatchlist();
  }, [userId]);

  const toggleCoin = async (coinId: string) => {
    if (!userId) return; 

    const isTracked = watchlist.includes(coinId);

    if (isTracked) {
      setWatchlist(prev => prev.filter(id => id !== coinId));
      await supabase.from('watchlists').delete().match({ user_id: userId, coin_id: coinId });
    } else {
      setWatchlist(prev => [...prev, coinId]);
      await supabase.from('watchlists').insert([{ user_id: userId, coin_id: coinId }]);
    }
  };

  return { watchlist, toggleCoin, loading };
}
