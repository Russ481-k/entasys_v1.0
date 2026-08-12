import type { QueryCondition } from '@/server/routers/projects';

interface Condition {
  field: string;
  operator: '=' | '!=';
  value: string;
}

interface QueryNode {
  type: 'condition' | 'operator';
  value: Condition | 'AND' | 'OR';
  left?: QueryNode;
  right?: QueryNode;
}

export function parseWhereClause(whereClause: string): QueryNode {
  let currentIndex = 0;

  function parseCondition(): QueryNode {
    skipWhitespace();

    if (whereClause[currentIndex] === '(') {
      currentIndex++;
      const node = parseExpression();
      skipWhitespace();
      if (whereClause[currentIndex] !== ')') {
        throw new Error(
          `Expected closing parenthesis at position ${currentIndex}`
        );
      }
      currentIndex++;
      return node;
    }

    const field = parseField();
    const operator = parseOperator();
    skipWhitespace();

    if (whereClause[currentIndex] !== "'") {
      throw new Error(`Expected quote at position ${currentIndex}`);
    }

    const value = parseValue();
    return {
      type: 'condition',
      value: { field, operator, value },
    };
  }

  function parseExpression(): QueryNode {
    let left = parseCondition();

    while (currentIndex < whereClause.length) {
      skipWhitespace();

      if (currentIndex >= whereClause.length) break;

      if (whereClause[currentIndex] === ')') break;

      const nextOp = whereClause.substring(currentIndex, currentIndex + 3);
      if (nextOp === 'AND' || nextOp.substring(0, 2) === 'OR') {
        const operator = nextOp === 'AND' ? 'AND' : 'OR';
        currentIndex += operator === 'AND' ? 3 : 2;
        skipWhitespace();

        const right = parseCondition();
        left = {
          type: 'operator',
          value: operator,
          left,
          right,
        };
      } else {
        break;
      }
    }

    return left;
  }

  function parseValue(): string {
    let value = '';
    currentIndex++; // Skip first quote
    while (
      currentIndex < whereClause.length &&
      whereClause[currentIndex] !== "'"
    ) {
      value += whereClause[currentIndex];
      currentIndex++;
    }
    currentIndex++; // Skip last quote
    return value;
  }

  function skipWhitespace() {
    while (
      currentIndex < whereClause.length &&
      whereClause[currentIndex] === ' '
    ) {
      currentIndex++;
    }
  }

  function parseField(): string {
    let field = '';
    skipWhitespace();
    while (
      currentIndex < whereClause.length &&
      !/[\s=!]/.test(whereClause[currentIndex] ?? '')
    ) {
      field += whereClause[currentIndex];
      currentIndex++;
    }
    return field;
  }

  function parseOperator(): '=' | '!=' {
    skipWhitespace();
    if (
      whereClause[currentIndex] === '!' &&
      whereClause[currentIndex + 1] === '='
    ) {
      currentIndex += 2;
      return '!=';
    } else if (whereClause[currentIndex] === '=') {
      currentIndex++;
      return '=';
    }
    throw new Error(`Invalid operator at position ${currentIndex}`);
  }

  return parseExpression();
}

// Logstash consumer가 숫자형(long)으로 색인하는 필드. 이들은 .keyword 서브필드가 없으므로
// 원본 필드에 숫자 term을 사용한다. 그 외 문자열 필드는 .keyword로 정확 일치시킨다.
const NUMERIC_FIELDS = new Set([
  'sourcePort',
  'destinationPort',
  'natSourcePort',
  'natDestinationPort',
  'bytes',
  'bytesSent',
  'bytesReceived',
  'packets',
  'packetsSent',
  'packetsReceived',
  'elapsedTimeSec',
  'sequenceNumber',
  'severity',
]);

// 분석형 match 대신 term(정확 일치)을 사용. 문자열은 .keyword 서브필드,
// 숫자 필드는 원본 필드에 숫자값으로 매칭하여 하이픈/다중토큰 값의 과다매칭을 방지한다.
function buildExactMatch(field: string, value: string): QueryCondition {
  if (NUMERIC_FIELDS.has(field)) {
    const num = Number(value);
    return { term: { [field]: Number.isNaN(num) ? value : num } };
  }
  return { term: { [`${field}.keyword`]: value } };
}

export function buildOpenSearchQuery(node: QueryNode): QueryCondition[] {
  function buildQuery(node: QueryNode): QueryCondition {
    if (node.type === 'condition') {
      const condition = node.value as Condition;
      if (condition.operator === '=') {
        return buildExactMatch(condition.field, condition.value);
      } else {
        return {
          bool: {
            must_not: [buildExactMatch(condition.field, condition.value)],
          },
        };
      }
    } else {
      const operator = node.value as 'AND' | 'OR';
      const left = buildQuery(node.left!);
      const right = buildQuery(node.right!);

      return {
        bool: {
          [operator === 'AND' ? 'must' : 'should']: [left, right],
          ...(operator === 'OR' ? { minimum_should_match: 1 } : {}),
        },
      };
    }
  }

  return [buildQuery(node)];
}
