INSERT INTO public.ai_model_pricing (
  provider, model,
  input_text_per_million_usd, cached_input_text_per_million_usd, output_text_per_million_usd,
  input_audio_per_million_usd, cached_input_audio_per_million_usd, output_audio_per_million_usd,
  effective_from, source_url
) VALUES (
  'cartesia', 'cartesia/sonic-3',
  -- NOTE: for cartesia we bill per CHARACTER, not per token. We store the
  -- per-million-characters USD rate in input_text_per_million_usd and write
  -- the character count into input_text_tokens at insert time. All other
  -- buckets are zero because Cartesia only charges for input characters.
  65.0, 0, 0,
  0, 0, 0,
  now(), 'https://cartesia.ai/pricing'
) ON CONFLICT DO NOTHING;