-- Auto-updates player_statistics when a tournament match is completed.
-- Tracks: matches_won, matches_lost, points_scored per player per year.
-- titles and podiums are updated separately via a scheduled job or admin action.

CREATE OR REPLACE FUNCTION update_player_statistics()
RETURNS TRIGGER AS $$
DECLARE
  v_year       int;
  v_reg_a_id   uuid;
  v_reg_b_id   uuid;
  v_p1_a       uuid;
  v_p2_a       uuid;
  v_p1_b       uuid;
  v_p2_b       uuid;
  v_winner_reg uuid;
BEGIN
  -- Only process completed tournament matches (not league fixtures)
  IF NEW.status <> 'completed' OR NEW.tournament_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get tournament year
  SELECT EXTRACT(YEAR FROM date)::int INTO v_year
  FROM tournaments WHERE id = NEW.tournament_id;

  IF v_year IS NULL THEN
    RETURN NEW;
  END IF;

  -- Resolve registrations from group_teams
  SELECT registration_id INTO v_reg_a_id FROM group_teams WHERE id = NEW.team_a_id;
  SELECT registration_id INTO v_reg_b_id FROM group_teams WHERE id = NEW.team_b_id;

  IF v_reg_a_id IS NULL OR v_reg_b_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get player IDs for both teams
  SELECT player1_id, player2_id INTO v_p1_a, v_p2_a FROM tournament_registrations WHERE id = v_reg_a_id;
  SELECT player1_id, player2_id INTO v_p1_b, v_p2_b FROM tournament_registrations WHERE id = v_reg_b_id;

  -- Determine winner registration
  IF NEW.winner_id = NEW.team_a_id THEN
    v_winner_reg := v_reg_a_id;
  ELSE
    v_winner_reg := v_reg_b_id;
  END IF;

  -- Upsert statistics for each of the 4 players
  INSERT INTO player_statistics (player_id, year, tournaments_played, matches_won, matches_lost, points_scored, titles, podiums)
  VALUES
    (v_p1_a, v_year, 0, 0, 0, 0, 0, 0),
    (v_p2_a, v_year, 0, 0, 0, 0, 0, 0),
    (v_p1_b, v_year, 0, 0, 0, 0, 0, 0),
    (v_p2_b, v_year, 0, 0, 0, 0, 0, 0)
  ON CONFLICT (player_id, year) DO NOTHING;

  -- Update team A players
  UPDATE player_statistics SET
    matches_won   = matches_won   + CASE WHEN v_winner_reg = v_reg_a_id THEN 1 ELSE 0 END,
    matches_lost  = matches_lost  + CASE WHEN v_winner_reg <> v_reg_a_id THEN 1 ELSE 0 END,
    points_scored = points_scored + COALESCE(NEW.score_a, 0)
  WHERE player_id IN (v_p1_a, v_p2_a) AND year = v_year;

  -- Update team B players
  UPDATE player_statistics SET
    matches_won   = matches_won   + CASE WHEN v_winner_reg = v_reg_b_id THEN 1 ELSE 0 END,
    matches_lost  = matches_lost  + CASE WHEN v_winner_reg <> v_reg_b_id THEN 1 ELSE 0 END,
    points_scored = points_scored + COALESCE(NEW.score_b, 0)
  WHERE player_id IN (v_p1_b, v_p2_b) AND year = v_year;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop and recreate trigger
DROP TRIGGER IF EXISTS trg_update_player_statistics ON matches;
CREATE TRIGGER trg_update_player_statistics
  AFTER UPDATE OF status ON matches
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM 'completed' AND NEW.status = 'completed')
  EXECUTE FUNCTION update_player_statistics();
