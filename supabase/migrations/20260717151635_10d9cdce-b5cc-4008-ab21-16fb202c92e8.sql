
-- ========================================================================
-- FASE 1 · PRÁTICA LIVRE ILIMITADA
-- ========================================================================

-- ------------------------------------------------------------------------
-- 1. practice_exercise_bank
-- ------------------------------------------------------------------------
CREATE TABLE public.practice_exercise_bank (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  level TEXT NOT NULL CHECK (level IN ('basic','intermediate','advanced')),
  topic TEXT NOT NULL DEFAULT 'general',
  grammar_tag TEXT,
  vocabulary_tag TEXT,
  exercise_type TEXT NOT NULL CHECK (exercise_type IN (
    'fill_in_blank','multiple_choice','reorder_sentence','choose_natural_phrase',
    'correct_error','vocabulary_choice','vocabulary_match','translation_objective','contextual_choice'
  )),
  prompt TEXT NOT NULL,
  instructions TEXT,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  correct_answer TEXT NOT NULL,
  acceptable_answers JSONB NOT NULL DEFAULT '[]'::jsonb,
  explanation_pt TEXT,
  difficulty INTEGER NOT NULL DEFAULT 2 CHECK (difficulty BETWEEN 1 AND 5),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_peb_active_level_topic ON public.practice_exercise_bank(level, topic, exercise_type) WHERE is_active;
CREATE INDEX idx_peb_type ON public.practice_exercise_bank(exercise_type) WHERE is_active;

GRANT SELECT ON public.practice_exercise_bank TO authenticated;
GRANT ALL ON public.practice_exercise_bank TO service_role;

ALTER TABLE public.practice_exercise_bank ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read active exercises" ON public.practice_exercise_bank
  FOR SELECT TO authenticated USING (is_active = true OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage exercises" ON public.practice_exercise_bank
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_peb_touch BEFORE UPDATE ON public.practice_exercise_bank
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ------------------------------------------------------------------------
-- 2. practice_templates
-- ------------------------------------------------------------------------
CREATE TABLE public.practice_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  level TEXT NOT NULL CHECK (level IN ('basic','intermediate','advanced')),
  topic TEXT NOT NULL DEFAULT 'general',
  grammar_tag TEXT,
  exercise_type TEXT NOT NULL,
  template_text TEXT NOT NULL,
  template_variables JSONB NOT NULL DEFAULT '{}'::jsonb,
  answer_rule JSONB NOT NULL DEFAULT '{}'::jsonb,
  explanation_pt TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ptpl_active_level ON public.practice_templates(level, topic) WHERE is_active;

GRANT SELECT ON public.practice_templates TO authenticated;
GRANT ALL ON public.practice_templates TO service_role;

ALTER TABLE public.practice_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read active templates" ON public.practice_templates
  FOR SELECT TO authenticated USING (is_active = true OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage templates" ON public.practice_templates
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_ptpl_touch BEFORE UPDATE ON public.practice_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ------------------------------------------------------------------------
-- 3. free_practice_sessions
-- ------------------------------------------------------------------------
CREATE TABLE public.free_practice_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL,
  topic TEXT,
  level TEXT,
  time_limit_seconds INTEGER,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  total_answered INTEGER NOT NULL DEFAULT 0,
  correct_answers INTEGER NOT NULL DEFAULT 0,
  incorrect_answers INTEGER NOT NULL DEFAULT 0,
  xp_earned INTEGER NOT NULL DEFAULT 0,
  ai_fallback_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_fps_user_created ON public.free_practice_sessions(user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.free_practice_sessions TO authenticated;
GRANT ALL ON public.free_practice_sessions TO service_role;

ALTER TABLE public.free_practice_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own free sessions" ON public.free_practice_sessions
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins read all free sessions" ON public.free_practice_sessions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_fps_touch BEFORE UPDATE ON public.free_practice_sessions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ------------------------------------------------------------------------
-- 4. free_practice_attempts
-- ------------------------------------------------------------------------
CREATE TABLE public.free_practice_attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.free_practice_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('exercise_bank','template','conversation_review_item','learning_item','vocabulary','synthetic')),
  source_id UUID,
  exercise_type TEXT NOT NULL,
  prompt_snapshot TEXT NOT NULL,
  correct_snapshot TEXT NOT NULL,
  user_answer TEXT,
  correct BOOLEAN NOT NULL DEFAULT false,
  attempts INTEGER NOT NULL DEFAULT 1,
  response_time_ms INTEGER,
  used_ai_fallback BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_fpa_session ON public.free_practice_attempts(session_id, created_at);
CREATE INDEX idx_fpa_user ON public.free_practice_attempts(user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.free_practice_attempts TO authenticated;
GRANT ALL ON public.free_practice_attempts TO service_role;

ALTER TABLE public.free_practice_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own attempts" ON public.free_practice_attempts
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins read all attempts" ON public.free_practice_attempts
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- ------------------------------------------------------------------------
-- 5. Seed inicial: ~120 exercícios objetivos
-- ------------------------------------------------------------------------
INSERT INTO public.practice_exercise_bank
  (level, topic, grammar_tag, exercise_type, prompt, options, correct_answer, acceptable_answers, explanation_pt, difficulty)
VALUES
-- FILL IN BLANK · basic (10)
('basic','routine','present_simple','fill_in_blank','I ____ coffee every morning.','["drink","drinks","drank","drinking"]','drink','["drink"]','Sujeito "I" usa a forma base do verbo no presente simples.',1),
('basic','routine','present_simple','fill_in_blank','She ____ to work by bus.','["go","goes","going","gone"]','goes','["goes"]','Terceira pessoa (she/he/it) recebe -s no presente simples.',1),
('basic','general','past_simple','fill_in_blank','Yesterday I ____ a great movie.','["watch","watches","watched","watching"]','watched','["watched"]','"Yesterday" pede o passado simples.',1),
('basic','work','present_continuous','fill_in_blank','He is ____ an email right now.','["write","writes","writing","wrote"]','writing','["writing"]','"Right now" pede o presente contínuo (be + verb-ing).',1),
('basic','general','articles','fill_in_blank','I saw ____ elephant at the zoo.','["a","an","the","-"]','an','["an"]','Antes de vogal usamos "an".',1),
('basic','travel','prepositions','fill_in_blank','The flight arrives ____ 7 pm.','["in","at","on","by"]','at','["at"]','Usamos "at" com horários específicos.',1),
('basic','routine','prepositions','fill_in_blank','I go to the gym ____ Mondays.','["in","at","on","by"]','on','["on"]','Usamos "on" com dias da semana.',1),
('basic','general','plural','fill_in_blank','I have two ____ in my bag.','["book","books","bookes","bookies"]','books','["books"]','O plural regular acrescenta -s.',1),
('basic','general','be_verb','fill_in_blank','They ____ my classmates.','["is","am","are","be"]','are','["are"]','"They" usa "are".',1),
('basic','general','past_simple','fill_in_blank','We ____ to Paris last summer.','["go","went","gone","goes"]','went','["went"]','"Go" no passado é "went".',1),
-- FILL IN BLANK · intermediate (10)
('intermediate','work','present_perfect','fill_in_blank','I ____ worked here for five years.','["have","has","had","having"]','have','["have"]','Present perfect com "I" usa "have".',2),
('intermediate','general','conditionals','fill_in_blank','If it rains, we ____ stay home.','["will","would","are","have"]','will','["will"]','First conditional: if + presente, will + verbo.',2),
('intermediate','meetings','modal_verbs','fill_in_blank','You ____ speak louder, please.','["should","must","would","could"]','could','["could","can"]','Pedido educado usa "could".',2),
('intermediate','travel','past_continuous','fill_in_blank','I ____ walking when it started to rain.','["was","were","am","been"]','was','["was"]','Sujeito singular "I" usa "was".',2),
('intermediate','work','passive_voice','fill_in_blank','The report ____ finished yesterday.','["was","were","is","has"]','was','["was"]','Passiva no passado simples: was/were + particípio.',2),
('intermediate','general','articles','fill_in_blank','She plays ____ piano beautifully.','["a","an","the","-"]','the','["the"]','Com instrumentos musicais usamos "the".',2),
('intermediate','general','comparatives','fill_in_blank','This exercise is ____ than the last one.','["easy","easier","more easy","easiest"]','easier','["easier"]','Adjetivo curto forma o comparativo com -er.',2),
('intermediate','sales','future','fill_in_blank','I ____ call you back in five minutes.','["am","will","would","have"]','will','["will"]','Decisão momentânea usa will.',2),
('intermediate','general','present_perfect','fill_in_blank','She ____ never been to Japan.','["has","have","had","was"]','has','["has"]','Terceira pessoa no present perfect usa "has".',2),
('intermediate','routine','used_to','fill_in_blank','I ____ to smoke when I was younger.','["use","used","using","uses"]','used','["used"]','"Used to" para hábitos do passado.',2),
-- FILL IN BLANK · advanced (5)
('advanced','work','third_conditional','fill_in_blank','If I ____ known, I would have called.','["have","had","would","did"]','had','["had"]','Third conditional: had + particípio.',3),
('advanced','general','reported_speech','fill_in_blank','He said he ____ tired.','["is","was","were","be"]','was','["was"]','Reported speech move o verbo para o passado.',3),
('advanced','interview','inversion','fill_in_blank','Never ____ I seen such a mess.','["have","had","did","was"]','have','["have"]','Inversão com "never" pede auxiliar antes do sujeito.',3),
('advanced','general','subjunctive','fill_in_blank','I wish I ____ more time.','["have","had","has","having"]','had','["had"]','Wish + past simple expressa desejo irreal.',3),
('advanced','meetings','modal_perfect','fill_in_blank','You ____ have told me earlier.','["should","must","will","would"]','should','["should"]','"Should have" para conselho no passado.',3),

-- MULTIPLE CHOICE · basic (8)
('basic','general','vocabulary','multiple_choice','What is the meaning of "buy"?','["comprar","vender","pagar","gastar"]','comprar','["comprar"]','"Buy" significa comprar.',1),
('basic','general','vocabulary','multiple_choice','What is the opposite of "hot"?','["warm","cold","cool","fresh"]','cold','["cold"]','O oposto direto de hot é cold.',1),
('basic','routine','vocabulary','multiple_choice','How do you say "café da manhã" in English?','["breakfast","lunch","dinner","snack"]','breakfast','["breakfast"]','Breakfast = café da manhã.',1),
('basic','travel','vocabulary','multiple_choice','Where do planes land and take off?','["station","airport","harbor","port"]','airport','["airport"]','Aviões pousam e decolam no aeroporto.',1),
('basic','work','vocabulary','multiple_choice','A person who works with you is your ____.','["boss","colleague","client","student"]','colleague','["colleague","coworker"]','Colleague/coworker = colega de trabalho.',1),
('basic','restaurants','vocabulary','multiple_choice','You use this to eat soup.','["fork","knife","spoon","cup"]','spoon','["spoon"]','Spoon = colher.',1),
('basic','general','vocabulary','multiple_choice','What does "tomorrow" mean?','["ontem","hoje","amanhã","depois"]','amanhã','["amanhã"]','Tomorrow = amanhã.',1),
('basic','general','vocabulary','multiple_choice','How do you say "obrigado"?','["please","sorry","thank you","excuse me"]','thank you','["thank you","thanks"]','Thank you = obrigado.',1),
-- MULTIPLE CHOICE · intermediate (10)
('intermediate','work','vocabulary','multiple_choice','A "deadline" is a ____.','["opinion","final date","meeting","salary"]','final date','["final date"]','Deadline = prazo final.',2),
('intermediate','meetings','phrasal_verbs','multiple_choice','"Bring up" means to ____.','["postpone","mention","cancel","end"]','mention','["mention"]','Bring up = mencionar um assunto.',2),
('intermediate','sales','phrasal_verbs','multiple_choice','"Follow up" means to ____.','["escape","continue contact","apologize","refuse"]','continue contact','["continue contact"]','Follow up = dar sequência ao contato.',2),
('intermediate','interview','vocabulary','multiple_choice','Your "strengths" are your ____.','["weak points","mistakes","strong points","hobbies"]','strong points','["strong points"]','Strengths = pontos fortes.',2),
('intermediate','general','idioms','multiple_choice','"Piece of cake" means ____.','["difficult","easy","tasty","boring"]','easy','["easy"]','Piece of cake = muito fácil.',2),
('intermediate','work','collocations','multiple_choice','Choose the correct collocation:','["make a decision","do a decision","have a decision","take a decision"]','make a decision','["make a decision"]','Coloca-se "make" com "decision".',2),
('intermediate','general','collocations','multiple_choice','Choose the correct collocation:','["do homework","make homework","have homework","take homework"]','do homework','["do homework"]','Usa-se "do" com homework.',2),
('intermediate','travel','vocabulary','multiple_choice','A "round-trip" ticket means ____.','["only going","going and returning","first class","cheapest"]','going and returning','["going and returning"]','Round-trip = ida e volta.',2),
('intermediate','technology','vocabulary','multiple_choice','A "device" is a ____.','["software","piece of equipment","website","cable"]','piece of equipment','["piece of equipment"]','Device = aparelho/equipamento.',2),
('intermediate','sales','vocabulary','multiple_choice','A "discount" is a ____.','["price reduction","tax","bonus","refund"]','price reduction','["price reduction"]','Discount = desconto (redução de preço).',2),
-- MULTIPLE CHOICE · advanced (7)
('advanced','interview','idioms','multiple_choice','"Think outside the box" means ____.','["think slowly","be creative","stay in bed","copy others"]','be creative','["be creative"]','Idioma para ser criativo.',3),
('advanced','work','idioms','multiple_choice','"Get the ball rolling" means to ____.','["start something","stop working","play sports","waste time"]','start something','["start something"]','Iniciar algo.',3),
('advanced','meetings','idioms','multiple_choice','"On the same page" means ____.','["confused","in agreement","angry","late"]','in agreement','["in agreement"]','Estar de acordo.',3),
('advanced','general','vocabulary','multiple_choice','A "breakthrough" is a ____.','["failure","sudden progress","habit","break time"]','sudden progress','["sudden progress"]','Breakthrough = avanço importante.',3),
('advanced','sales','vocabulary','multiple_choice','To "close a deal" means to ____.','["cancel a sale","finalize a sale","open a shop","meet a client"]','finalize a sale','["finalize a sale"]','Fechar um negócio.',3),
('advanced','work','idioms','multiple_choice','"Cut corners" means to ____.','["work carefully","take shortcuts","fold paper","fire people"]','take shortcuts','["take shortcuts"]','Fazer de forma incompleta para economizar.',3),
('advanced','general','idioms','multiple_choice','"Under the weather" means ____.','["outside","sick","cold","busy"]','sick','["sick"]','Sentir-se mal/doente.',3),

-- REORDER SENTENCE (15)
('basic','routine','word_order','reorder_sentence','Order the words to form a correct sentence.','["I","go","to","school","every","day"]','I go to school every day.','["I go to school every day.","i go to school every day"]','Sujeito + verbo + complemento + expressão de tempo.',1),
('basic','general','word_order','reorder_sentence','Order the words to form a correct sentence.','["She","is","a","doctor"]','She is a doctor.','["She is a doctor."]','Sujeito + be + artigo + substantivo.',1),
('basic','travel','word_order','reorder_sentence','Order the words to form a correct sentence.','["We","are","going","to","the","beach"]','We are going to the beach.','["We are going to the beach."]','Presente contínuo: be + verb-ing.',1),
('basic','restaurants','word_order','reorder_sentence','Order the words to form a correct sentence.','["I","would","like","some","water"]','I would like some water.','["I would like some water."]','"Would like" para pedidos educados.',1),
('basic','work','word_order','reorder_sentence','Order the words to form a correct sentence.','["He","works","in","a","big","company"]','He works in a big company.','["He works in a big company."]','Ordem adjetivo antes do substantivo.',1),
('intermediate','meetings','word_order','reorder_sentence','Order the words to form a correct sentence.','["Could","you","repeat","that","please"]','Could you repeat that please?','["Could you repeat that please?","Could you repeat that, please?"]','Pedido educado com could + sujeito + verbo.',2),
('intermediate','work','word_order','reorder_sentence','Order the words to form a correct sentence.','["I","have","been","working","here","since","2020"]','I have been working here since 2020.','["I have been working here since 2020."]','Present perfect continuous + since + ano.',2),
('intermediate','interview','word_order','reorder_sentence','Order the words to form a correct sentence.','["Tell","me","about","yourself","please"]','Tell me about yourself please.','["Tell me about yourself please.","Tell me about yourself, please."]','Imperativo + complementos.',2),
('intermediate','sales','word_order','reorder_sentence','Order the words to form a correct sentence.','["Can","I","help","you","with","anything"]','Can I help you with anything?','["Can I help you with anything?"]','Auxiliar + sujeito + verbo em pergunta.',2),
('intermediate','general','word_order','reorder_sentence','Order the words to form a correct sentence.','["She","doesn''t","like","spicy","food"]','She doesn''t like spicy food.','["She doesn''t like spicy food.","She does not like spicy food."]','Negativa no presente simples.',2),
('intermediate','technology','word_order','reorder_sentence','Order the words to form a correct sentence.','["The","internet","is","not","working","today"]','The internet is not working today.','["The internet is not working today.","The internet isn''t working today."]','Ordem sujeito + be + not + verb-ing.',2),
('advanced','work','word_order','reorder_sentence','Order the words to form a correct sentence.','["If","I","had","known","I","would","have","told","you"]','If I had known I would have told you.','["If I had known I would have told you.","If I had known, I would have told you."]','Third conditional: had + particípio, would have + particípio.',3),
('advanced','meetings','word_order','reorder_sentence','Order the words to form a correct sentence.','["Not","only","did","he","apologize","but","he","also","paid"]','Not only did he apologize but he also paid.','["Not only did he apologize but he also paid.","Not only did he apologize, but he also paid."]','Inversão com "not only".',3),
('advanced','interview','word_order','reorder_sentence','Order the words to form a correct sentence.','["I''m","looking","forward","to","hearing","from","you"]','I''m looking forward to hearing from you.','["I''m looking forward to hearing from you.","I am looking forward to hearing from you."]','"Look forward to" + verbo em -ing.',3),
('advanced','sales','word_order','reorder_sentence','Order the words to form a correct sentence.','["We","should","have","closed","the","deal","yesterday"]','We should have closed the deal yesterday.','["We should have closed the deal yesterday."]','Should + have + particípio.',3),

-- CHOOSE NATURAL PHRASE (15)
('basic','general','naturalness','choose_natural_phrase','Which sounds more natural?','["How do you do?","How you are?","How are you?"]','How are you?','["How are you?"]','Saudação natural.',1),
('basic','routine','naturalness','choose_natural_phrase','Which sounds more natural?','["I have 25 years.","I am 25 years old.","I am with 25 years."]','I am 25 years old.','["I am 25 years old."]','Idade usa "be" em inglês.',1),
('basic','restaurants','naturalness','choose_natural_phrase','Which sounds more natural?','["The bill, please.","The account, please.","The check, please."]','The check, please.','["The check, please.","The bill, please."]','Nos EUA "check"; UK "bill". Ambos naturais.',1),
('basic','travel','naturalness','choose_natural_phrase','Which sounds more natural?','["Where is the bathroom?","Where has bathroom?","Where the bathroom is?"]','Where is the bathroom?','["Where is the bathroom?"]','Ordem em perguntas: WH + be + sujeito.',1),
('basic','general','naturalness','choose_natural_phrase','Which sounds more natural?','["I''m agree with you.","I agree with you.","I am agree with you."]','I agree with you.','["I agree with you."]','"Agree" já é verbo, não usa be.',1),
('intermediate','work','naturalness','choose_natural_phrase','Which sounds more natural?','["I make a mistake yesterday.","I made a mistake yesterday.","I did a mistake yesterday."]','I made a mistake yesterday.','["I made a mistake yesterday."]','Colocação "make a mistake" no passado.',2),
('intermediate','meetings','naturalness','choose_natural_phrase','Which sounds more natural?','["Let''s to start the meeting.","Let''s start the meeting.","Let us starting the meeting."]','Let''s start the meeting.','["Let''s start the meeting.","Let us start the meeting."]','Let''s + verbo base.',2),
('intermediate','interview','naturalness','choose_natural_phrase','Which sounds more natural?','["I have experience of five years.","I have five years of experience.","I have five years experience."]','I have five years of experience.','["I have five years of experience."]','Colocação natural em entrevista.',2),
('intermediate','sales','naturalness','choose_natural_phrase','Which sounds more natural?','["I will send you the proposal.","I send you the proposal.","I am send you the proposal."]','I will send you the proposal.','["I will send you the proposal.","I''ll send you the proposal."]','Promessa futura com will.',2),
('intermediate','general','naturalness','choose_natural_phrase','Which sounds more natural?','["It depends of the situation.","It depends on the situation.","It depends in the situation."]','It depends on the situation.','["It depends on the situation."]','Depend + on.',2),
('intermediate','travel','naturalness','choose_natural_phrase','Which sounds more natural?','["I''m traveling in vacation.","I''m traveling on vacation.","I''m traveling for vacation."]','I''m traveling on vacation.','["I''m traveling on vacation.","I''m on vacation."]','Colocação "on vacation".',2),
('advanced','work','naturalness','choose_natural_phrase','Which sounds more natural?','["I''m looking forward to meet you.","I''m looking forward to meeting you.","I''m looking forward meet you."]','I''m looking forward to meeting you.','["I''m looking forward to meeting you."]','"Look forward to" + gerúndio.',3),
('advanced','meetings','naturalness','choose_natural_phrase','Which sounds more natural?','["Could you please clarify?","Could you please clarifying?","Could you clarify please?"]','Could you please clarify?','["Could you please clarify?","Could you clarify, please?"]','Pedido educado natural.',3),
('advanced','interview','naturalness','choose_natural_phrase','Which sounds more natural?','["I take initiative in projects.","I have initiative in projects.","I do initiative in projects."]','I take initiative in projects.','["I take initiative in projects."]','Colocação "take initiative".',3),
('advanced','sales','naturalness','choose_natural_phrase','Which sounds more natural?','["We reached out to the client.","We reached out the client.","We reach out for the client."]','We reached out to the client.','["We reached out to the client."]','"Reach out to" + pessoa.',3),

-- CORRECT ERROR (15)
('basic','general','be_verb','correct_error','Which word is wrong? "She are my friend."','["She","are","my","friend"]','are','["are"]','"She" pede "is", não "are".',1),
('basic','routine','third_person','correct_error','Which word is wrong? "He go to work every day."','["He","go","to","work"]','go','["go"]','Terceira pessoa: "goes".',1),
('basic','general','articles','correct_error','Which word is wrong? "I saw a elephant."','["I","saw","a","elephant"]','a','["a"]','Antes de vogal usa-se "an".',1),
('basic','travel','prepositions','correct_error','Which word is wrong? "The meeting is in 3 pm."','["meeting","is","in","3 pm"]','in','["in"]','Horários pedem "at".',1),
('basic','general','plural','correct_error','Which word is wrong? "I have three childs."','["I","have","three","childs"]','childs','["childs"]','Plural irregular: "children".',1),
('intermediate','work','past_simple','correct_error','Which word is wrong? "Yesterday I go to the office."','["Yesterday","I","go","to"]','go','["go"]','Passado simples: "went".',2),
('intermediate','meetings','present_perfect','correct_error','Which word is wrong? "I have saw that report."','["I","have","saw","report"]','saw','["saw"]','Present perfect usa particípio: "seen".',2),
('intermediate','sales','collocations','correct_error','Which word is wrong? "We need to do a decision now."','["do","a","decision","now"]','do','["do"]','Colocação correta: "make a decision".',2),
('intermediate','general','prepositions','correct_error','Which word is wrong? "It depends of you."','["It","depends","of","you"]','of','["of"]','"Depend on".',2),
('intermediate','interview','collocations','correct_error','Which word is wrong? "I have interest on this position."','["have","interest","on","position"]','on','["on"]','Correto: "interested in" ou "interest in".',2),
('intermediate','general','word_choice','correct_error','Which word is wrong? "I am agree with your idea."','["am","agree","with","idea"]','am','["am"]','"Agree" é verbo: "I agree".',2),
('advanced','work','conditionals','correct_error','Which word is wrong? "If I would have known, I would have called."','["If","would","have","known"]','would','["would"]','Third conditional: "If I had known".',3),
('advanced','meetings','gerund','correct_error','Which word is wrong? "I''m looking forward to meet you."','["looking","forward","to","meet"]','meet','["meet"]','"Look forward to" + gerúndio: "meeting".',3),
('advanced','interview','reported_speech','correct_error','Which word is wrong? "He said he is tired."','["He","said","he","is"]','is','["is"]','Reported speech: "was".',3),
('advanced','general','articles','correct_error','Which word is wrong? "She plays piano very well."','["She","plays","piano","very"]','piano','["piano"]','Falta "the": "plays the piano".',3),

-- VOCABULARY CHOICE (15)
('basic','work','vocabulary','vocabulary_choice','Choose the best word: "I need to send an ____ to my boss."','["email","meal","hour","week"]','email','["email"]','Email é o termo comum.',1),
('basic','restaurants','vocabulary','vocabulary_choice','Choose the best word: "Can I see the ____, please?"','["menu","menu book","list food","meal card"]','menu','["menu"]','No restaurante pedimos o menu.',1),
('basic','travel','vocabulary','vocabulary_choice','Choose the best word: "I lost my ____ at the airport."','["luggage","meal","chair","door"]','luggage','["luggage"]','Bagagem = luggage.',1),
('basic','routine','vocabulary','vocabulary_choice','Choose the best word: "I ____ up at 7 am."','["wake","break","take","make"]','wake','["wake"]','Wake up = acordar.',1),
('basic','general','vocabulary','vocabulary_choice','Choose the best word: "It''s ____ outside today."','["rain","raining","rains","rained"]','raining','["raining"]','It is + verb-ing para clima em andamento.',1),
('intermediate','meetings','vocabulary','vocabulary_choice','Choose the best word: "Let''s ____ this meeting until Friday."','["postpone","cancel","start","attend"]','postpone','["postpone"]','Postpone = adiar.',2),
('intermediate','work','vocabulary','vocabulary_choice','Choose the best word: "I need to ____ this project by Monday."','["deliver","delivery","delivered","delivering"]','deliver','["deliver"]','Deliver = entregar.',2),
('intermediate','sales','vocabulary','vocabulary_choice','Choose the best word: "Our new product will ____ next month."','["launch","launcher","launching","launched"]','launch','["launch"]','Launch = lançar.',2),
('intermediate','interview','vocabulary','vocabulary_choice','Choose the best word: "I have strong ____ skills."','["communication","communicated","communicating","communicative"]','communication','["communication"]','Communication skills = habilidades de comunicação.',2),
('intermediate','technology','vocabulary','vocabulary_choice','Choose the best word: "I need to ____ this file to your email."','["attach","fix","open","print"]','attach','["attach"]','Attach = anexar.',2),
('intermediate','general','vocabulary','vocabulary_choice','Choose the best word: "The train was ____ by 20 minutes."','["delayed","broken","canceled","stopped"]','delayed','["delayed"]','Delayed = atrasado.',2),
('advanced','work','vocabulary','vocabulary_choice','Choose the best word: "We need to ____ our strategy to the market."','["adapt","adopt","adept","adept"]','adapt','["adapt"]','Adapt = adaptar.',3),
('advanced','sales','vocabulary','vocabulary_choice','Choose the best word: "The client wants to ____ the contract terms."','["negotiate","navigate","neglect","note"]','negotiate','["negotiate"]','Negotiate = negociar.',3),
('advanced','meetings','vocabulary','vocabulary_choice','Choose the best word: "Please ____ the main points at the end."','["summarize","memorize","organize","supervise"]','summarize','["summarize"]','Summarize = resumir.',3),
('advanced','interview','vocabulary','vocabulary_choice','Choose the best word: "I''m ____ in a leadership role."','["interested","interesting","interest","interests"]','interested','["interested"]','"Interested in" = interessado em.',3),

-- CONTEXTUAL CHOICE (10)
('basic','restaurants','conversation','contextual_choice','Waiter: "Are you ready to order?" You reply:','["No, thank you.","Yes, I''d like a pizza, please.","I am fine.","Where is my seat?"]','Yes, I''d like a pizza, please.','["Yes, I''d like a pizza, please."]','Resposta adequada ao contexto.',1),
('basic','general','conversation','contextual_choice','Someone says "Thank you." You reply:','["You are welcome.","Please.","Sorry.","Yes, I do."]','You are welcome.','["You are welcome.","You''re welcome."]','Resposta padrão para agradecimento.',1),
('basic','travel','conversation','contextual_choice','At check-in the agent asks "Aisle or window?" You want the window seat:','["Window, please.","Yes, thanks.","I don''t know.","Two, please."]','Window, please.','["Window, please."]','Escolha direta e educada.',1),
('intermediate','work','conversation','contextual_choice','Your boss asks "Can you finish this by Friday?" You are unsure:','["Yes, definitely.","I''m afraid I''m not sure yet, I''ll let you know.","No.","Maybe not."]','I''m afraid I''m not sure yet, I''ll let you know.','["I''m afraid I''m not sure yet, I''ll let you know."]','Resposta profissional e clara.',2),
('intermediate','meetings','conversation','contextual_choice','You didn''t understand a colleague. You say:','["Say again please.","I''m sorry, could you repeat that?","What?","I don''t know English."]','I''m sorry, could you repeat that?','["I''m sorry, could you repeat that?"]','Pedido educado de repetição.',2),
('intermediate','interview','conversation','contextual_choice','Interviewer: "Why did you leave your last job?" Best answer:','["The salary was terrible.","I was looking for new challenges and growth opportunities.","I hated my boss.","I don''t remember."]','I was looking for new challenges and growth opportunities.','["I was looking for new challenges and growth opportunities."]','Resposta positiva e profissional.',2),
('intermediate','sales','conversation','contextual_choice','A client says "It''s too expensive." Best reply:','["Ok, goodbye.","I understand. Let me show you the value it brings.","No, it isn''t.","Buy anyway."]','I understand. Let me show you the value it brings.','["I understand. Let me show you the value it brings."]','Resposta consultiva.',2),
('advanced','meetings','conversation','contextual_choice','You disagree politely with a manager. Best option:','["You are wrong.","I see your point, however I''d like to suggest another approach.","No way.","I don''t care."]','I see your point, however I''d like to suggest another approach.','["I see your point, however I''d like to suggest another approach."]','Discordância educada.',3),
('advanced','work','conversation','contextual_choice','A colleague asks for help but you''re very busy. Best reply:','["I''m busy.","I''d love to help, but I''m at capacity today. Can it wait until tomorrow?","No.","Leave me alone."]','I''d love to help, but I''m at capacity today. Can it wait until tomorrow?','["I''d love to help, but I''m at capacity today. Can it wait until tomorrow?"]','Recusa educada e produtiva.',3),
('advanced','sales','conversation','contextual_choice','Wrapping up a call with a prospect:','["Bye.","Thank you for your time. I''ll follow up with an email later today.","Ok, done.","See you."]','Thank you for your time. I''ll follow up with an email later today.','["Thank you for your time. I''ll follow up with an email later today."]','Encerramento profissional.',3);

-- ------------------------------------------------------------------------
-- 6. Templates iniciais
-- ------------------------------------------------------------------------
INSERT INTO public.practice_templates (level, topic, grammar_tag, exercise_type, template_text, template_variables, answer_rule, explanation_pt)
VALUES
('basic','routine','present_simple','fill_in_blank',
 '{SUBJECT} ____ to {PLACE} every {TIME}.',
 '{"SUBJECT":["He","She","My brother","My sister","Lucas","Anna"],"PLACE":["work","school","the gym","the office"],"TIME":["day","morning","Monday","week"],"VERB_BASE":"go","VERB_3RD":"goes"}',
 '{"rule":"third_person_present","answer_from_subject":{"third":"VERB_3RD","other":"VERB_BASE"},"options_from":["VERB_BASE","VERB_3RD","going","gone"]}',
 'Verbo no presente simples concorda com o sujeito.'),
('basic','general','past_simple','fill_in_blank',
 'Yesterday {SUBJECT} ____ {OBJECT}.',
 '{"SUBJECT":["I","he","she","we","they"],"OBJECT":["a book","a movie","some coffee","the news","a song"],"VERB_PAST":"watched","VERB_BASE":"watch"}',
 '{"answer":"VERB_PAST","options_from":["VERB_BASE","VERB_PAST","watches","watching"]}',
 'Passado simples com "yesterday".'),
('intermediate','work','present_perfect','fill_in_blank',
 '{SUBJECT} ____ worked here for {YEARS} years.',
 '{"SUBJECT":["I","We","They","You","He","She"],"YEARS":["two","three","five","ten"],"AUX_HAVE":"have","AUX_HAS":"has"}',
 '{"rule":"third_person_have","answer_from_subject":{"third":"AUX_HAS","other":"AUX_HAVE"},"options_from":["have","has","had","having"]}',
 'Present perfect: have/has + particípio.'),
('intermediate','travel','prepositions','multiple_choice',
 'The {THING} arrives ____ {TIME}.',
 '{"THING":["flight","train","bus","package"],"TIME":["7 pm","noon","midnight","6 am"]}',
 '{"answer":"at","options":["in","at","on","by"]}',
 'Usamos "at" com horários específicos.'),
('basic','general','word_order','reorder_sentence',
 '{SUBJECT} {VERB} {OBJECT} every {TIME}.',
 '{"SUBJECT":["I","We","They"],"VERB":["study","read","practice"],"OBJECT":["English","books","music"],"TIME":["day","morning","week"]}',
 '{"assemble":"SUBJECT VERB OBJECT every TIME"}',
 'Ordem sujeito + verbo + objeto + tempo.'),
('intermediate','meetings','modal_verbs','choose_natural_phrase',
 'Politely ask a colleague to {ACTION}.',
 '{"ACTION":["repeat that","speak louder","share the screen","send the file"]}',
 '{"correct":"Could you {ACTION}, please?","distractors":["You {ACTION}!","{ACTION} now.","Please {ACTION} you."]}',
 'Pedido educado com "could".');
