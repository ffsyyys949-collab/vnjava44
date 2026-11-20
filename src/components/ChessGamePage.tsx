import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, RotateCcw, Undo2, RefreshCw, Volume2, VolumeX, Bot, Users } from 'lucide-react';

type Color = 'w' | 'b';
type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
type GameMode = 'pvp' | 'ai';
type AiDifficulty = 'easy' | 'medium' | 'hard';
type ChessSoundType = 'select' | 'move' | 'capture' | 'check' | 'win' | 'lose';

interface Piece {
  color: Color;
  type: PieceType;
}
type Board = (Piece | null)[][];

interface MoveRecord {
  from: [number, number];
  to: [number, number];
  piece: Piece;
  captured: Piece | null;
  promotion?: PieceType;
  castling?: 'K' | 'Q' | 'k' | 'q';
  enPassant?: boolean;
  boardSnapshot: Board;
  castlingRightsSnapshot: CastlingRights;
  enPassantTargetSnapshot: [number, number] | null;
  turnSnapshot: Color;
}

interface CastlingRights {
  wK: boolean;
  wQ: boolean;
  bK: boolean;
  bQ: boolean;
}

const PIECE_UNICODE: Record<Color, Record<PieceType, string>> = {
  w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
  b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' },
};

const PIECE_VALUES: Record<PieceType, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

function createInitialBoard(): Board {
  const backRow: PieceType[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  const board: Board = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (let c = 0; c < 8; c++) {
    board[0][c] = { color: 'b', type: backRow[c] };
    board[1][c] = { color: 'b', type: 'p' };
    board[6][c] = { color: 'w', type: 'p' };
    board[7][c] = { color: 'w', type: backRow[c] };
  }
  return board;
}

function cloneBoard(board: Board): Board {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}

function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function findKing(board: Board, color: Color): [number, number] | null {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.color === color && p.type === 'k') return [r, c];
    }
  }
  return null;
}

function isSquareAttacked(board: Board, row: number, col: number, byColor: Color): boolean {
  const pawnDir = byColor === 'w' ? 1 : -1;
  for (const dc of [-1, 1]) {
    const pr = row + pawnDir;
    const pc = col + dc;
    if (inBounds(pr, pc)) {
      const p = board[pr][pc];
      if (p && p.color === byColor && p.type === 'p') return true;
    }
  }

  const knightMoves = [
    [-2, -1], [-2, 1], [-1, -2], [-1, 2],
    [1, -2], [1, 2], [2, -1], [2, 1],
  ];
  for (const [dr, dc] of knightMoves) {
    const nr = row + dr;
    const nc = col + dc;
    if (inBounds(nr, nc)) {
      const p = board[nr][nc];
      if (p && p.color === byColor && p.type === 'n') return true;
    }
  }

  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const kr = row + dr;
      const kc = col + dc;
      if (inBounds(kr, kc)) {
        const p = board[kr][kc];
        if (p && p.color === byColor && p.type === 'k') return true;
      }
    }
  }

  const ortho = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (const [dr, dc] of ortho) {
    let r = row + dr;
    let c = col + dc;
    while (inBounds(r, c)) {
      const p = board[r][c];
      if (p) {
        if (p.color === byColor && (p.type === 'r' || p.type === 'q')) return true;
        break;
      }
      r += dr;
      c += dc;
    }
  }

  const diag = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  for (const [dr, dc] of diag) {
    let r = row + dr;
    let c = col + dc;
    while (inBounds(r, c)) {
      const p = board[r][c];
      if (p) {
        if (p.color === byColor && (p.type === 'b' || p.type === 'q')) return true;
        break;
      }
      r += dr;
      c += dc;
    }
  }

  return false;
}

function isInCheck(board: Board, color: Color): boolean {
  const king = findKing(board, color);
  if (!king) return false;
  return isSquareAttacked(board, king[0], king[1], color === 'w' ? 'b' : 'w');
}

function getPseudoMoves(
  board: Board,
  r: number,
  c: number,
  castling: CastlingRights,
  epTarget: [number, number] | null
): Array<[number, number]> {
  const p = board[r][c];
  if (!p) return [];
  const moves: Array<[number, number]> = [];
  const opp: Color = p.color === 'w' ? 'b' : 'w';

  if (p.type === 'p') {
    const dir = p.color === 'w' ? -1 : 1;
    const startRow = p.color === 'w' ? 6 : 1;
    if (inBounds(r + dir, c) && !board[r + dir][c]) {
      moves.push([r + dir, c]);
      if (r === startRow && !board[r + 2 * dir][c]) {
        moves.push([r + 2 * dir, c]);
      }
    }
    for (const dc of [-1, 1]) {
      const nr = r + dir;
      const nc = c + dc;
      if (inBounds(nr, nc)) {
        const target = board[nr][nc];
        if (target && target.color === opp) {
          moves.push([nr, nc]);
        } else if (epTarget && epTarget[0] === nr && epTarget[1] === nc) {
          moves.push([nr, nc]);
        }
      }
    }
    return moves;
  }

  if (p.type === 'n') {
    const offsets = [
      [-2, -1], [-2, 1], [-1, -2], [-1, 2],
      [1, -2], [1, 2], [2, -1], [2, 1],
    ];
    for (const [dr, dc] of offsets) {
      const nr = r + dr;
      const nc = c + dc;
      if (inBounds(nr, nc) && (!board[nr][nc] || board[nr][nc]!.color === opp)) {
        moves.push([nr, nc]);
      }
    }
    return moves;
  }

  if (p.type === 'k') {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (inBounds(nr, nc) && (!board[nr][nc] || board[nr][nc]!.color === opp)) {
          moves.push([nr, nc]);
        }
      }
    }
    if (!isInCheck(board, p.color)) {
      if (p.color === 'w' && r === 7 && c === 4) {
        if (castling.wK && !board[7][5] && !board[7][6] && board[7][7]?.type === 'r' && board[7][7]?.color === 'w') {
          if (!isSquareAttacked(board, 7, 5, 'b') && !isSquareAttacked(board, 7, 6, 'b')) {
            moves.push([7, 6]);
          }
        }
        if (castling.wQ && !board[7][3] && !board[7][2] && !board[7][1] && board[7][0]?.type === 'r' && board[7][0]?.color === 'w') {
          if (!isSquareAttacked(board, 7, 3, 'b') && !isSquareAttacked(board, 7, 2, 'b')) {
            moves.push([7, 2]);
          }
        }
      }
      if (p.color === 'b' && r === 0 && c === 4) {
        if (castling.bK && !board[0][5] && !board[0][6] && board[0][7]?.type === 'r' && board[0][7]?.color === 'b') {
          if (!isSquareAttacked(board, 0, 5, 'w') && !isSquareAttacked(board, 0, 6, 'w')) {
            moves.push([0, 6]);
          }
        }
        if (castling.bQ && !board[0][3] && !board[0][2] && !board[0][1] && board[0][0]?.type === 'r' && board[0][0]?.color === 'b') {
          if (!isSquareAttacked(board, 0, 3, 'w') && !isSquareAttacked(board, 0, 2, 'w')) {
            moves.push([0, 2]);
          }
        }
      }
    }
    return moves;
  }

  const dirs: Array<[number, number]> = [];
  if (p.type === 'b' || p.type === 'q') {
    dirs.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
  }
  if (p.type === 'r' || p.type === 'q') {
    dirs.push([-1, 0], [1, 0], [0, -1], [0, 1]);
  }
  for (const [dr, dc] of dirs) {
    let nr = r + dr;
    let nc = c + dc;
    while (inBounds(nr, nc)) {
      const target = board[nr][nc];
      if (!target) {
        moves.push([nr, nc]);
      } else {
        if (target.color === opp) moves.push([nr, nc]);
        break;
      }
      nr += dr;
      nc += dc;
    }
  }
  return moves;
}

function applyRawMove(
  board: Board,
  from: [number, number],
  to: [number, number],
  epTarget: [number, number] | null,
  promotionType?: PieceType
): { nextBoard: Board; captured: Piece | null; isEnPassant: boolean; castlingCode?: 'K' | 'Q' | 'k' | 'q' } {
  const nextBoard = cloneBoard(board);
  const piece = nextBoard[from[0]][from[1]]!;
  let captured = nextBoard[to[0]][to[1]];
  let isEnPassant = false;
  let castlingCode: 'K' | 'Q' | 'k' | 'q' | undefined;

  if (piece.type === 'p' && epTarget && to[0] === epTarget[0] && to[1] === epTarget[1] && !captured) {
    captured = nextBoard[from[0]][to[1]];
    nextBoard[from[0]][to[1]] = null;
    isEnPassant = true;
  }

  if (piece.type === 'k' && Math.abs(to[1] - from[1]) === 2) {
    if (to[1] === 6) {
      nextBoard[from[0]][5] = nextBoard[from[0]][7];
      nextBoard[from[0]][7] = null;
      castlingCode = piece.color === 'w' ? 'K' : 'k';
    } else if (to[1] === 2) {
      nextBoard[from[0]][3] = nextBoard[from[0]][0];
      nextBoard[from[0]][0] = null;
      castlingCode = piece.color === 'w' ? 'Q' : 'q';
    }
  }

  nextBoard[from[0]][from[1]] = null;
  nextBoard[to[0]][to[1]] = promotionType ? { color: piece.color, type: promotionType } : { ...piece };

  return { nextBoard, captured, isEnPassant, castlingCode };
}

function getLegalMoves(
  board: Board,
  r: number,
  c: number,
  castling: CastlingRights,
  epTarget: [number, number] | null
): Array<[number, number]> {
  const p = board[r][c];
  if (!p) return [];
  const pseudo = getPseudoMoves(board, r, c, castling, epTarget);
  return pseudo.filter(([nr, nc]) => {
    const { nextBoard } = applyRawMove(board, [r, c], [nr, nc], epTarget);
    return !isInCheck(nextBoard, p.color);
  });
}

function hasAnyLegalMove(
  board: Board,
  color: Color,
  castling: CastlingRights,
  epTarget: [number, number] | null
): boolean {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.color === color) {
        if (getLegalMoves(board, r, c, castling, epTarget).length > 0) {
          return true;
        }
      }
    }
  }
  return false;
}

interface CandidateMove {
  from: [number, number];
  to: [number, number];
  promoType?: PieceType;
  score: number;
}

function pickAiMove(
  board: Board,
  castling: CastlingRights,
  epTarget: [number, number] | null,
  difficulty: AiDifficulty
): { from: [number, number]; to: [number, number]; promoType?: PieceType } | null {
  const candidates: CandidateMove[] = [];

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece || piece.color !== 'b') continue;
      const legal = getLegalMoves(board, r, c, castling, epTarget);
      for (const [nr, nc] of legal) {
        const promoType: PieceType | undefined =
          piece.type === 'p' && nr === 7 ? 'q' : undefined;
        const { nextBoard, captured } = applyRawMove(board, [r, c], [nr, nc], epTarget, promoType);
        const capturedVal = captured ? PIECE_VALUES[captured.type] : 0;
        const givesCheck = isInCheck(nextBoard, 'w');
        const centerBonus = nr >= 2 && nr <= 5 && nc >= 2 && nc <= 5 ? 0.25 : 0;
        const promoBonus = promoType ? 8 : 0;

        let score = 0;
        if (difficulty === 'easy') {
          score = Math.random();
        } else if (difficulty === 'medium') {
          // Prioritaskan memakan bidak lawan bernilai tertinggi, selain itu langkah acak
          score = capturedVal * 10 + promoBonus + Math.random() * 0.5;
        } else {
          // Sulit: evaluasi makan bidak tinggi, skak raja putih, hindari membuang bidak mahal secara gratis
          const movedPieceVal = PIECE_VALUES[piece.type];
          const hangsTarget = isSquareAttacked(nextBoard, nr, nc, 'w') && !isSquareAttacked(nextBoard, nr, nc, 'b');
          const safetyPenalty = hangsTarget ? movedPieceVal * 4 : 0;
          const deliversMate = givesCheck && !hasAnyLegalMove(nextBoard, 'w', castling, null) ? 1000 : 0;
          score =
            deliversMate +
            capturedVal * 12 +
            (givesCheck ? 6 : 0) +
            promoBonus +
            centerBonus -
            safetyPenalty +
            Math.random() * 0.35;
        }

        candidates.push({ from: [r, c], to: [nr, nc], promoType, score });
      }
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  const top = candidates[0];
  return { from: top.from, to: top.to, promoType: top.promoType };
}

export function ChessGamePage({ onBack }: { onBack: () => void }) {
  const [gameMode, setGameMode] = useState<GameMode>('pvp');
  const [aiDifficulty, setAiDifficulty] = useState<AiDifficulty>('medium');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  const [board, setBoard] = useState<Board>(createInitialBoard);
  const [turn, setTurn] = useState<Color>('w');
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const [castling, setCastling] = useState<CastlingRights>({
    wK: true,
    wQ: true,
    bK: true,
    bQ: true,
  });
  const [epTarget, setEpTarget] = useState<[number, number] | null>(null);
  const [history, setHistory] = useState<MoveRecord[]>([]);
  const [flipped, setFlipped] = useState(false);
  const [promotionPending, setPromotionPending] = useState<{
    from: [number, number];
    to: [number, number];
    color: Color;
  } | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const aiTimerRef = useRef<number | null>(null);
  const lastResultSoundRef = useRef<string | null>(null);

  const playChessSound = useCallback(
    (type: ChessSoundType) => {
      if (!soundEnabled) return;
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;
        if (!audioCtxRef.current) {
          audioCtxRef.current = new AudioCtx();
        }
        const ctx = audioCtxRef.current;
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }
        const now = ctx.currentTime;

        const playTone = (
          freqStart: number,
          freqEnd: number,
          duration: number,
          wave: OscillatorType,
          gainLevel: number,
          offsetSec = 0
        ) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = wave;
          osc.frequency.setValueAtTime(freqStart, now + offsetSec);
          if (freqEnd !== freqStart) {
            osc.frequency.exponentialRampToValueAtTime(
              Math.max(40, freqEnd),
              now + offsetSec + duration
            );
          }
          gain.gain.setValueAtTime(0.001, now + offsetSec);
          gain.gain.linearRampToValueAtTime(gainLevel, now + offsetSec + 0.006);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + offsetSec + duration);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + offsetSec);
          osc.stop(now + offsetSec + duration + 0.01);
        };

        if (type === 'select') {
          // Suara klik halus
          playTone(680, 440, 0.032, 'sine', 0.07);
        } else if (type === 'move') {
          // Suara bidak melangkah "tuk"
          playTone(230, 125, 0.065, 'triangle', 0.14);
        } else if (type === 'capture') {
          // Suara memakan bidak "plak" lebih tegas
          playTone(390, 95, 0.085, 'triangle', 0.22);
          playTone(180, 70, 0.07, 'square', 0.07, 0.01);
        } else if (type === 'check') {
          // Suara skak "ting"
          playTone(880, 1320, 0.16, 'sine', 0.15);
        } else if (type === 'win') {
          playTone(523.25, 523.25, 0.12, 'triangle', 0.14, 0);
          playTone(659.25, 659.25, 0.12, 'triangle', 0.14, 0.11);
          playTone(783.99, 783.99, 0.26, 'triangle', 0.16, 0.22);
        } else if (type === 'lose') {
          playTone(349.23, 293.66, 0.16, 'sawtooth', 0.09, 0);
          playTone(261.63, 196.0, 0.28, 'sawtooth', 0.09, 0.16);
        }
      } catch {}
    },
    [soundEnabled]
  );

  useEffect(() => {
    return () => {
      if (aiTimerRef.current) {
        window.clearTimeout(aiTimerRef.current);
        aiTimerRef.current = null;
      }
    };
  }, []);

  const legalMoves = useMemo(() => {
    if (!selected) return [];
    return getLegalMoves(board, selected[0], selected[1], castling, epTarget);
  }, [board, selected, castling, epTarget]);

  const inCheck = useMemo(() => isInCheck(board, turn), [board, turn]);
  const anyLegal = useMemo(
    () => hasAnyLegalMove(board, turn, castling, epTarget),
    [board, turn, castling, epTarget]
  );

  const gameResult = useMemo(() => {
    if (!anyLegal) {
      if (inCheck) {
        const winner = turn === 'w' ? ('b' as Color) : ('w' as Color);
        const label =
          gameMode === 'ai'
            ? winner === 'w'
              ? 'Kamu Menang!'
              : 'AI Menang!'
            : winner === 'w'
            ? 'Putih Menang'
            : 'Hitam Menang';
        return {
          status: 'checkmate' as const,
          winner,
          label,
        };
      }
      return { status: 'stalemate' as const, winner: null, label: 'Remis (Stalemate)' };
    }
    return null;
  }, [anyLegal, inCheck, turn, gameMode]);

  useEffect(() => {
    if (!gameResult) {
      lastResultSoundRef.current = null;
      return;
    }
    const resultKey = `${gameResult.status}-${gameResult.winner}-${history.length}`;
    if (lastResultSoundRef.current === resultKey) return;
    lastResultSoundRef.current = resultKey;

    if (gameResult.status === 'checkmate') {
      if (gameMode === 'ai' && gameResult.winner === 'b') {
        playChessSound('lose');
      } else {
        playChessSound('win');
      }
    }
  }, [gameResult, gameMode, history.length, playChessSound]);

  const capturedByWhite = useMemo(
    () =>
      history
        .filter((m) => m.captured && m.captured.color === 'b')
        .map((m) => m.captured!)
        .sort((a, b) => PIECE_VALUES[b.type] - PIECE_VALUES[a.type]),
    [history]
  );

  const capturedByBlack = useMemo(
    () =>
      history
        .filter((m) => m.captured && m.captured.color === 'w')
        .map((m) => m.captured!)
        .sort((a, b) => PIECE_VALUES[b.type] - PIECE_VALUES[a.type]),
    [history]
  );

  const lastMove = history.length > 0 ? history[history.length - 1] : null;
  const kingPos = useMemo(() => (inCheck ? findKing(board, turn) : null), [board, inCheck, turn]);

  const executeMove = useCallback(
    (from: [number, number], to: [number, number], promoType?: PieceType) => {
      const piece = board[from[0]][from[1]];
      if (!piece) return;

      const { nextBoard, captured, isEnPassant, castlingCode } = applyRawMove(
        board,
        from,
        to,
        epTarget,
        promoType
      );

      const nextTurn: Color = turn === 'w' ? 'b' : 'w';
      const opponentInCheck = isInCheck(nextBoard, nextTurn);

      if (opponentInCheck) {
        playChessSound('check');
      } else if (captured) {
        playChessSound('capture');
      } else {
        playChessSound('move');
      }

      const nextCastling = { ...castling };
      if (piece.type === 'k') {
        if (piece.color === 'w') {
          nextCastling.wK = false;
          nextCastling.wQ = false;
        } else {
          nextCastling.bK = false;
          nextCastling.bQ = false;
        }
      }
      if (piece.type === 'r') {
        if (from[0] === 7 && from[1] === 0) nextCastling.wQ = false;
        if (from[0] === 7 && from[1] === 7) nextCastling.wK = false;
        if (from[0] === 0 && from[1] === 0) nextCastling.bQ = false;
        if (from[0] === 0 && from[1] === 7) nextCastling.bK = false;
      }
      if (to[0] === 7 && to[1] === 0) nextCastling.wQ = false;
      if (to[0] === 7 && to[1] === 7) nextCastling.wK = false;
      if (to[0] === 0 && to[1] === 0) nextCastling.bQ = false;
      if (to[0] === 0 && to[1] === 7) nextCastling.bK = false;

      let nextEp: [number, number] | null = null;
      if (piece.type === 'p' && Math.abs(to[0] - from[0]) === 2) {
        nextEp = [(from[0] + to[0]) / 2, from[1]];
      }

      setHistory((prev) => [
        ...prev,
        {
          from,
          to,
          piece: { ...piece },
          captured: captured ? { ...captured } : null,
          promotion: promoType,
          castling: castlingCode,
          enPassant: isEnPassant,
          boardSnapshot: cloneBoard(board),
          castlingRightsSnapshot: { ...castling },
          enPassantTargetSnapshot: epTarget,
          turnSnapshot: turn,
        },
      ]);

      setBoard(nextBoard);
      setCastling(nextCastling);
      setEpTarget(nextEp);
      setTurn(nextTurn);
      setSelected(null);
      setPromotionPending(null);
    },
    [board, castling, epTarget, playChessSound, turn]
  );

  // Jalankan giliran AI otomatis setelah delay 500ms
  useEffect(() => {
    if (gameMode !== 'ai' || turn !== 'b' || gameResult || promotionPending) {
      return;
    }

    aiTimerRef.current = window.setTimeout(() => {
      aiTimerRef.current = null;
      const move = pickAiMove(board, castling, epTarget, aiDifficulty);
      if (move) {
        executeMove(move.from, move.to, move.promoType);
      }
    }, 500);

    return () => {
      if (aiTimerRef.current) {
        window.clearTimeout(aiTimerRef.current);
        aiTimerRef.current = null;
      }
    };
  }, [gameMode, turn, gameResult, promotionPending, board, castling, epTarget, aiDifficulty, executeMove]);

  const handleSquareClick = (r: number, c: number) => {
    if (gameResult || promotionPending) return;
    if (gameMode === 'ai' && turn === 'b') return;

    const clickedPiece = board[r][c];
    if (selected) {
      const isLegal = legalMoves.some(([lr, lc]) => lr === r && lc === c);
      if (isLegal) {
        const movingPiece = board[selected[0]][selected[1]];
        if (
          movingPiece?.type === 'p' &&
          ((movingPiece.color === 'w' && r === 0) || (movingPiece.color === 'b' && r === 7))
        ) {
          setPromotionPending({ from: selected, to: [r, c], color: movingPiece.color });
          return;
        }
        executeMove(selected, [r, c]);
        return;
      }
    }

    if (clickedPiece && clickedPiece.color === turn) {
      if (selected && selected[0] === r && selected[1] === c) {
        setSelected(null);
      } else {
        setSelected([r, c]);
        playChessSound('select');
      }
    } else {
      setSelected(null);
    }
  };

  const handleUndo = () => {
    if (history.length === 0 || promotionPending) return;
    if (aiTimerRef.current) {
      window.clearTimeout(aiTimerRef.current);
      aiTimerRef.current = null;
    }

    if (gameMode === 'ai' && turn === 'w' && history.length >= 2) {
      const playerPrev = history[history.length - 2];
      setBoard(cloneBoard(playerPrev.boardSnapshot));
      setCastling({ ...playerPrev.castlingRightsSnapshot });
      setEpTarget(playerPrev.enPassantTargetSnapshot);
      setTurn(playerPrev.turnSnapshot);
      setHistory((h) => h.slice(0, -2));
      setSelected(null);
      return;
    }

    const prev = history[history.length - 1];
    setBoard(cloneBoard(prev.boardSnapshot));
    setCastling({ ...prev.castlingRightsSnapshot });
    setEpTarget(prev.enPassantTargetSnapshot);
    setTurn(prev.turnSnapshot);
    setHistory((h) => h.slice(0, -1));
    setSelected(null);
  };

  const handleReset = (nextMode?: GameMode) => {
    if (aiTimerRef.current) {
      window.clearTimeout(aiTimerRef.current);
      aiTimerRef.current = null;
    }
    if (nextMode) {
      setGameMode(nextMode);
      if (nextMode === 'ai') setFlipped(false);
    }
    setBoard(createInitialBoard());
    setTurn('w');
    setSelected(null);
    setCastling({ wK: true, wQ: true, bK: true, bQ: true });
    setEpTarget(null);
    setHistory([]);
    setPromotionPending(null);
    lastResultSoundRef.current = null;
  };

  const displayRows = flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
  const displayCols = flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

  const aiDiffLabel = aiDifficulty === 'easy' ? 'Mudah' : aiDifficulty === 'medium' ? 'Sedang' : 'Sulit';
  const topColor: Color = flipped ? 'w' : 'b';
  const bottomColor: Color = flipped ? 'b' : 'w';

  const getPlayerLabel = (color: Color) => {
    if (gameMode === 'ai') {
      return color === 'w' ? 'Kamu (Putih)' : `AI Komputer (${aiDiffLabel})`;
    }
    return color === 'w' ? 'Putih (P1)' : 'Hitam (P2)';
  };

  const getTurnBadge = (color: Color) => {
    if (gameMode === 'ai') {
      return color === 'b' ? 'AI Sedang Berpikir...' : 'Giliran Kamu';
    }
    return 'Giliran';
  };

  return (
    <div className="min-h-screen ze-transparent-page flex flex-col pb-24">
      <header className="sticky top-0 z-30 h-14 px-4 flex items-center justify-between border-b border-white/10">
        <button
          onClick={onBack}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/15 text-white transition active:scale-95 cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-base font-bold text-white tracking-wide">Catur</h1>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setSoundEnabled((s) => !s)}
            className={`min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl border transition active:scale-95 cursor-pointer ${
              soundEnabled
                ? 'bg-white/15 border-white/25 text-white'
                : 'bg-white/5 border-white/10 text-white/45'
            }`}
            title={soundEnabled ? 'Speaker ON' : 'Speaker OFF'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setFlipped((f) => !f)}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/15 text-white transition active:scale-95 cursor-pointer"
            title="Balik Papan"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={handleUndo}
            disabled={history.length === 0}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/15 disabled:opacity-35 text-white transition active:scale-95 cursor-pointer"
            title="Undo"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleReset()}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/15 text-white transition active:scale-95 cursor-pointer"
            title="Mulai Ulang"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-3 py-3 gap-2.5 max-w-md w-full mx-auto">
        {/* Mode & AI Difficulty Selector */}
        <div className="w-full space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleReset('pvp')}
              className={`py-2 px-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer ${
                gameMode === 'pvp'
                  ? 'bg-white text-black border-white shadow'
                  : 'bg-zinc-900/80 text-white/75 border-white/15 hover:bg-zinc-800/80'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>VS TEMAN (2 Player)</span>
            </button>
            <button
              type="button"
              onClick={() => handleReset('ai')}
              className={`py-2 px-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer ${
                gameMode === 'ai'
                  ? 'bg-white text-black border-white shadow'
                  : 'bg-zinc-900/80 text-white/75 border-white/15 hover:bg-zinc-800/80'
              }`}
            >
              <Bot className="w-3.5 h-3.5" />
              <span>VS AI (Komputer)</span>
            </button>
          </div>

          {gameMode === 'ai' && (
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { id: 'easy', label: 'Mudah' },
                  { id: 'medium', label: 'Sedang' },
                  { id: 'hard', label: 'Sulit' },
                ] as const
              ).map((lvl) => (
                <button
                  key={lvl.id}
                  type="button"
                  onClick={() => setAiDifficulty(lvl.id)}
                  className={`py-1.5 rounded-lg border text-[11px] font-semibold transition active:scale-95 cursor-pointer ${
                    aiDifficulty === lvl.id
                      ? 'bg-zinc-100 text-black border-white'
                      : 'bg-zinc-900/75 text-white/70 border-white/10 hover:text-white'
                  }`}
                >
                  {lvl.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Top Player Bar (Black unless flipped) */}
        <div
          className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl border ${
            topColor === turn && !gameResult
              ? 'bg-zinc-900/95 border-amber-400/70'
              : 'bg-zinc-950/80 border-white/10'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center text-lg font-bold ${
                topColor === 'w'
                  ? 'bg-zinc-100 text-zinc-900'
                  : 'bg-zinc-800 text-white border border-white/15'
              }`}
            >
              {topColor === 'w' ? '♔' : '♚'}
            </div>
            <div>
              <p className="text-xs font-semibold text-white">{getPlayerLabel(topColor)}</p>
              <div className="flex items-center gap-0.5 text-sm leading-none min-h-[16px] text-zinc-300">
                {(topColor === 'w' ? capturedByWhite : capturedByBlack).map((cp, idx) => (
                  <span key={idx}>{PIECE_UNICODE[cp.color][cp.type]}</span>
                ))}
              </div>
            </div>
          </div>
          {topColor === turn && !gameResult && (
            <span className="text-[11px] font-semibold text-amber-300">
              {getTurnBadge(topColor)}
            </span>
          )}
        </div>

        {/* Classic Chess Board */}
        <div className="w-full aspect-square rounded-xl overflow-hidden shadow-2xl border-2 border-zinc-800 relative select-none">
          <div className="grid grid-cols-8 grid-rows-8 w-full h-full">
            {displayRows.map((r) =>
              displayCols.map((c) => {
                const isLight = (r + c) % 2 === 0;
                const piece = board[r][c];
                const isSelected = selected && selected[0] === r && selected[1] === c;
                const isLegal = legalMoves.some(([lr, lc]) => lr === r && lc === c);
                const isLast =
                  lastMove &&
                  ((lastMove.from[0] === r && lastMove.from[1] === c) ||
                    (lastMove.to[0] === r && lastMove.to[1] === c));
                const isKingCheck = kingPos && kingPos[0] === r && kingPos[1] === c;

                let bgClass = isLight ? 'bg-[#EEEED2]' : 'bg-[#769656]';
                if (isLast) bgClass = isLight ? 'bg-[#F6F669]' : 'bg-[#BACA2B]';
                if (isSelected) bgClass = 'bg-[#F6F669]';
                if (isKingCheck) bgClass = 'bg-rose-500';

                return (
                  <button
                    key={`${r}-${c}`}
                    type="button"
                    onClick={() => handleSquareClick(r, c)}
                    className={`relative flex items-center justify-center w-full h-full ${bgClass} transition-colors`}
                  >
                    {c === displayCols[0] && (
                      <span
                        className={`absolute top-0.5 left-1 text-[9px] font-bold leading-none pointer-events-none ${
                          isLight ? 'text-[#769656]' : 'text-[#EEEED2]'
                        }`}
                      >
                        {8 - r}
                      </span>
                    )}
                    {r === displayRows[7] && (
                      <span
                        className={`absolute bottom-0.5 right-1 text-[9px] font-bold leading-none pointer-events-none ${
                          isLight ? 'text-[#769656]' : 'text-[#EEEED2]'
                        }`}
                      >
                        {files[c]}
                      </span>
                    )}

                    {piece && (
                      <span
                        className={`text-[30px] sm:text-[36px] leading-none select-none pointer-events-none ${
                          piece.color === 'w'
                            ? 'text-white drop-shadow-[0_1.5px_1.5px_rgba(0,0,0,0.85)]'
                            : 'text-zinc-950 drop-shadow-[0_1px_1px_rgba(255,255,255,0.28)]'
                        }`}
                      >
                        {PIECE_UNICODE[piece.color][piece.type]}
                      </span>
                    )}

                    {isLegal && !piece && (
                      <span className="w-3.5 h-3.5 rounded-full bg-black/22 pointer-events-none" />
                    )}
                    {isLegal && piece && (
                      <span className="absolute inset-1 rounded-full border-[3px] border-black/28 pointer-events-none" />
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Pawn Promotion Picker Overlay */}
          {promotionPending && (
            <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-20 p-4">
              <div className="bg-zinc-900 border border-white/15 rounded-2xl p-4 flex flex-col items-center gap-3 shadow-2xl">
                <p className="text-xs font-bold text-white">Pilih Promosi Pion</p>
                <div className="flex items-center gap-2">
                  {(['q', 'r', 'b', 'n'] as PieceType[]).map((pt) => (
                    <button
                      key={pt}
                      onClick={() =>
                        executeMove(promotionPending.from, promotionPending.to, pt)
                      }
                      className="w-12 h-12 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-white/15 flex items-center justify-center text-3xl text-white active:scale-95 transition"
                    >
                      {PIECE_UNICODE[promotionPending.color][pt]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Game Over Overlay */}
          {gameResult && (
            <div className="absolute inset-0 bg-black/75 flex items-center justify-center z-20 p-4">
              <div className="bg-zinc-900 border border-white/15 rounded-2xl p-5 w-full max-w-[260px] text-center space-y-3 shadow-2xl">
                <p className="text-lg font-bold text-white">{gameResult.label}</p>
                <button
                  onClick={() => handleReset()}
                  className="w-full py-2.5 rounded-xl bg-white text-black font-bold text-sm active:scale-95 transition cursor-pointer"
                >
                  Main Lagi
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Player Bar (White unless flipped) */}
        <div
          className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl border ${
            bottomColor === turn && !gameResult
              ? 'bg-zinc-900/95 border-amber-400/70'
              : 'bg-zinc-950/80 border-white/10'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center text-lg font-bold ${
                bottomColor === 'w'
                  ? 'bg-zinc-100 text-zinc-900'
                  : 'bg-zinc-800 text-white border border-white/15'
              }`}
            >
              {bottomColor === 'w' ? '♔' : '♚'}
            </div>
            <div>
              <p className="text-xs font-semibold text-white">{getPlayerLabel(bottomColor)}</p>
              <div className="flex items-center gap-0.5 text-sm leading-none min-h-[16px] text-zinc-300">
                {(bottomColor === 'w' ? capturedByWhite : capturedByBlack).map((cp, idx) => (
                  <span key={idx}>{PIECE_UNICODE[cp.color][cp.type]}</span>
                ))}
              </div>
            </div>
          </div>
          {bottomColor === turn && !gameResult && (
            <span className="text-[11px] font-semibold text-amber-300">
              {getTurnBadge(bottomColor)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
