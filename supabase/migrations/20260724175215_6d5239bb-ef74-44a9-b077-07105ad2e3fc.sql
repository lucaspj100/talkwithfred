
INSERT INTO public.ai_model_pricing (provider, model, input_text_per_million_usd, cached_input_text_per_million_usd, output_text_per_million_usd, input_audio_per_million_usd, cached_input_audio_per_million_usd, output_audio_per_million_usd, source_url)
VALUES
  ('openai', 'openai/gpt-4o-mini-transcribe', 1.250000, 0.000000, 5.000000, 3.000000, 0.000000, 0.000000, 'https://platform.openai.com/docs/pricing'),
  ('google', 'google/gemini-3.1-flash-lite', 0.100000, 0.025000, 0.400000, 0.000000, 0.000000, 0.000000, 'https://ai.google.dev/pricing'),
  -- TTS: pass character count as input_text_tokens. 15 USD / 1M chars = $0.015/1k chars.
  ('openai', 'openai/gpt-4o-mini-tts',       15.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 'https://platform.openai.com/docs/pricing');
