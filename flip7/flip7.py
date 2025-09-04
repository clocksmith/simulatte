import random
import itertools
from collections import defaultdict, Counter
import matplotlib.pyplot as plt

# --- Deck Setup ---
def create_deck():
    """Creates a standard Flip 7 deck."""
    deck = []
    # Number cards
    for i in range(13):
        count = i + 1 if i < 2 else i
        if i == 1 or i == 0:
            count = 1
        deck.extend([("Number", i)] * count)

    # Modifier cards
    deck.extend([("Modifier", "+2")] * 1)
    deck.extend([("Modifier", "+4")] * 1)
    deck.extend([("Modifier", "+6")] * 1)
    deck.extend([("Modifier", "+8")] * 1)
    deck.extend([("Modifier", "+10")] * 1)
    deck.extend([("Modifier", "x2")] * 1)

    # Action cards
    deck.extend([("Action", "Flip Three")] * 3)
    deck.extend([("Action", "Freeze")] * 3)
    deck.extend([("Action", "Second Chance")] * 3)

    return deck

# --- Game Logic ---
def calculate_score(hand):
    """Calculates the score of a hand."""
    score = 0
    has_x2 = False
    number_cards = []
    modifier_total = 0
    flip7 = False

    for card_type, value in hand:
        if card_type == "Number":
            number_cards.append(value)
        elif card_type == "Modifier":
            if value == "x2":
                has_x2 = True
            else:
                modifier_total += int(value[1:])

    if len(set(number_cards)) == 7 and len(number_cards) == 7:
        flip7 = True

    if has_x2:
        score = sum(number_cards) * 2
    else:
        score = sum(number_cards)

    score += modifier_total

    if flip7:
        score += 15

    return score

def has_busted(hand):
    """Checks if a hand has busted."""
    number_cards = [value for card_type, value in hand if card_type == "Number"]
    return len(number_cards) != len(set(number_cards))

def deal_card(deck, player_hand, visible_cards, discarded_cards, active_players, all_players, scores, player_number):
    """Deals a card from the deck, handling Action cards."""
    if not deck:
        # Reshuffle discard pile and visible cards if the deck is empty
        deck.extend(discarded_cards)
        discarded_cards[:] = []
        deck.extend(visible_cards)
        visible_cards[:] = []
        random.shuffle(deck)

    # If still no cards, then it's an exceptional case (should not normally happen)
    if not deck:
        print("Exceptional case: No cards in deck, discard, or visible to reshuffle.")
        return

    card = deck.pop()
    card_type, value = card
    visible_cards.append(card)
    player_hand.append(card)

    if card_type == "Action":
        if value == "Second Chance":
            has_second_chance = False
            for p_card in player_hand:
                if p_card == ("Action", "Second Chance"):
                    has_second_chance = True
            if has_second_chance:
                # Give to another player if they have a Second Chance
                found_player = False
                for i in range(len(all_players)):
                    if i != player_number and i in active_players:
                        all_players[i].append(card)
                        player_hand.pop()
                        found_player = True
                        break
                if not found_player:
                    discarded_cards.append(player_hand.pop())
                    visible_cards.pop()

        elif value == "Freeze":
            eligible_targets = [p for p in active_players if p != player_number]
            if eligible_targets:
                target_player = random.choice(eligible_targets)
                all_players[target_player].append(card)
                if target_player in active_players:
                    active_players.remove(target_player)
                scores[target_player] = calculate_score(all_players[target_player])
            else:
                if player_number in active_players:
                    active_players.remove(player_number)
                scores[player_number] = calculate_score(player_hand)

        elif value == "Flip Three":
            eligible_targets = [p for p in active_players if p != player_number]
            if eligible_targets:
                target_player = random.choice(eligible_targets)
            else:
                target_player = player_number

            for _ in range(3):
                if not has_busted(all_players[target_player]):
                    if not deck:
                        deck.extend(discarded_cards)
                        discarded_cards[:] = []
                        deck.extend(visible_cards)
                        visible_cards[:] = []
                        random.shuffle(deck)

                    if not deck:
                        print("Exceptional case: No cards in deck, discard, or visible to reshuffle during Flip Three.")
                        continue

                    next_card = deck.pop()
                    visible_cards.append(next_card)
                    all_players[target_player].append(next_card)

                    if next_card[0] == "Action" and next_card[1] == "Flip Three":
                        # Handle nested Flip Three cards by re-adding it to the deck
                        deck.append(next_card)
                        all_players[target_player].remove(next_card)
                        visible_cards.remove(next_card)

# --- Monte Carlo Simulation ---
def play_round(deck, player_strategies, visible_cards, discarded_cards, scores, all_players):
    """Plays a single round of Flip 7."""
    num_players = len(player_strategies)
    hands = [[] for _ in range(num_players)]
    active_players = list(range(num_players))

    for i in range(num_players):
        deal_card(deck, hands[i], visible_cards, discarded_cards, active_players, hands, scores, i)
        all_players[i] = hands[i]

    round_finished = False
    while active_players and not round_finished:
        current_player = active_players[0]

        strategy = player_strategies[current_player]
        if strategy(hands[current_player], visible_cards, discarded_cards, scores, num_players):
            deal_card(deck, hands[current_player], visible_cards, discarded_cards, active_players, hands, scores, current_player)
            if has_busted(hands[current_player]):
                has_second_chance = False
                for card in hands[current_player]:
                    if card == ("Action", "Second Chance"):
                        has_second_chance = True
                        second_chance_index = hands[current_player].index(card)

                if has_second_chance:
                    discarded_cards.append(hands[current_player].pop(second_chance_index))
                    visible_cards.pop(second_chance_index)

                    number_cards = [value for card_type, value in hands[current_player] if card_type == "Number"]
                    last_card = hands[current_player][-1]

                    if number_cards.count(last_card[1]) > 1:
                        discarded_cards.append(hands[current_player].pop())
                        visible_cards.pop()
                else:
                    if current_player in active_players:
                        active_players.remove(current_player)
        else:
            if current_player in active_players:
                active_players.remove(current_player)
            scores[current_player] = calculate_score(hands[current_player])

        all_players = hands

        for hand in hands:
            if calculate_score(hand) - 15 == sum([value for _, value in hand if isinstance(value, int)]):
                round_finished = True
                for p in active_players:
                    scores[p] = calculate_score(hands[p])
                break

        if not round_finished and current_player in active_players:
            active_players.append(active_players.pop(0))

    for p in range(num_players):
        if scores[p] == 0:
            scores[p] = calculate_score(hands[p])
    return scores

def monte_carlo_simulation(num_simulations, player_strategies):
    """Runs the Monte Carlo simulation."""
    num_players = len(player_strategies)
    total_scores = [0] * num_players
    game_outcomes = []

    for _ in range(num_simulations):
        deck = create_deck()
        random.shuffle(deck)
        visible_cards = []
        discarded_cards = []
        scores = [0] * num_players
        all_players = [[] for _ in range(num_players)]

        while max(scores) < 200:
            round_scores = play_round(deck, player_strategies, visible_cards, discarded_cards, scores, all_players)
            for i in range(num_players):
                scores[i] += round_scores[i]

            deck = create_deck()
            random.shuffle(deck)
            
            # Instead of clearing, add visible cards to discarded cards
            discarded_cards.extend(visible_cards)
            visible_cards = []

            for p in range(len(all_players)):
                for card in all_players[p]:
                    discarded_cards.append(card)
                all_players[p] = []

        winning_score = max(scores)
        winners = [i for i, score in enumerate(scores) if score == winning_score]
        game_outcomes.append({
            "winners": winners,
            "final_scores": scores.copy()
        })

        for winner in winners:
            total_scores[winner] += 1

    return total_scores, game_outcomes

# --- Example Player Strategies ---
def cautious_strategy(hand, visible_cards, discarded_cards, scores, num_players):
    """A cautious strategy: hit only if bust probability is less than 25%."""
    number_cards = [value for card_type, value in hand if card_type == "Number"]
    unique_numbers = set(number_cards)
    bust_cards = 0

    for num in unique_numbers:
        total_count = num + 1 if num < 2 else num
        if num == 1 or num == 0:
            total_count = 1
        visible_count = sum(1 for card_type, value in visible_cards if card_type == "Number" and value == num)
        discarded_count = sum(1 for card_type, value in discarded_cards if card_type == "Number" and value == num)
        bust_cards += total_count - visible_count - discarded_count

    remaining_cards = 94 - len(visible_cards) - len(discarded_cards)
    bust_probability = bust_cards / remaining_cards if remaining_cards > 0 else 0

    return bust_probability < 0.25

def risky_strategy(hand, visible_cards, discarded_cards, scores, num_players):
    """A risky strategy: hit if bust probability is less than 50% and score is less than 15."""
    current_score = calculate_score(hand)
    number_cards = [value for card_type, value in hand if card_type == "Number"]
    unique_numbers = set(number_cards)
    bust_cards = 0
    for num in unique_numbers:
        total_count = num + 1 if num < 2 else num
        if num == 1 or num == 0:
            total_count = 1
        visible_count = sum(1 for card_type, value in visible_cards if card_type == "Number" and value == num)
        discarded_count = sum(1 for card_type, value in discarded_cards if card_type == "Number" and value == num)
        bust_cards += total_count - visible_count - discarded_count

    remaining_cards = 94 - len(visible_cards) - len(discarded_cards)
    bust_probability = bust_cards / remaining_cards if remaining_cards > 0 else 0

    return bust_probability < 0.5 or current_score < 15

def super_risky_strategy(hand, visible_cards, discarded_cards, scores, num_players):
    """An even riskier strategy: hit if bust probability is less than 75% and score is less than 20."""
    current_score = calculate_score(hand)
    number_cards = [value for card_type, value in hand if card_type == "Number"]
    unique_numbers = set(number_cards)
    bust_cards = 0
    for num in unique_numbers:
        total_count = num + 1 if num < 2 else num
        if num == 1 or num == 0:
            total_count = 1
        visible_count = sum(1 for card_type, value in visible_cards if card_type == "Number" and value == num)
        discarded_count = sum(1 for card_type, value in discarded_cards if card_type == "Number" and value == num)
        bust_cards += total_count - visible_count - discarded_count

    remaining_cards = 94 - len(visible_cards) - len(discarded_cards)
    bust_probability = bust_cards / remaining_cards if remaining_cards > 0 else 0

    return bust_probability < 0.75 or current_score < 20

# --- Formatting Functions ---
def _format_combination_with_counts(items):
    counts = Counter(items)
    formatted_parts = []
    for item, count in counts.items():
        if callable(item):
            item_name = item.__name__.replace("_strategy", "")
        else:
            item_name = str(item)
        formatted_parts.append(f"{item_name} x{count}")
    return "{ " + ", ".join(formatted_parts) + " }"

def _format_combination_listing_all(items):
    formatted_items = []
    for item in items:
        if callable(item):
            formatted_items.append(item.__name__.replace("_strategy", ""))
        else:
            formatted_items.append(str(item))
    return "{ " + ", ".join(formatted_items) + " }"

def format_combination(combination, use_counts=False):
    if use_counts:
        return _format_combination_with_counts(combination)
    else:
        return _format_combination_listing_all(combination)

# --- Run the Simulation and Analyze Results ---
num_simulations = 1000

strategies = [cautious_strategy, risky_strategy, super_risky_strategy]

# Generate combinations
all_combinations = list(itertools.combinations_with_replacement(strategies, 4))
all_combinations = [c for c in all_combinations if len(set(c)) > 1]

results = {}
strategy_win_counts = defaultdict(int)
detailed_outcomes = []

for i, combination in enumerate(all_combinations):
    print(
        f"Running simulation {i + 1}/{len(all_combinations)} for combination: {format_combination(combination, use_counts=True)}"
    )
    win_counts, game_outcomes = monte_carlo_simulation(
        num_simulations, list(combination)
    )
    combination_key = tuple(s.__name__ for s in combination)
    results[combination_key] = win_counts

    detailed_outcomes.append(
        {"combination": combination_key, "game_outcomes": game_outcomes}
    )

    for i, strategy in enumerate(combination):
        strategy_win_counts[strategy.__name__] += win_counts[i]

# --- Visualization ---

# Prepare data for plotting
strategy_names = [s.__name__.replace("_strategy", "") for s in strategies]
combination_labels = [
    format_combination(c, use_counts=True) for c in all_combinations
]
win_data = []

for combination in all_combinations:
    wins_by_strategy = defaultdict(int)
    total_wins = 0
    for game_result in detailed_outcomes[all_combinations.index(combination)]["game_outcomes"]:
        for winner in game_result["winners"]:
            wins_by_strategy[combination[winner].__name__.replace("_strategy", "")] += 1
            total_wins += 1

    win_percentages = []
    for strategy_name in strategy_names:
        wins = wins_by_strategy[strategy_name]
        win_percentage = (wins / total_wins) * 100 if total_wins > 0 else 0

