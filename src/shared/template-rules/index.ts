export type RuleOperator =
  | 'equals'
  | 'not_equals'
  | 'greater_than'
  | 'greater_than_or_equal'
  | 'less_than'
  | 'less_than_or_equal'
  | 'contains'
  | 'not_contains'
  | 'is_empty'
  | 'is_not_empty'
  | 'is_true'
  | 'is_false';

export interface RuleCondition {
  fieldKey: string;
  operator: RuleOperator;
  value?: unknown;
}

export interface RuleConditionGroup {
  operator: 'AND' | 'OR';
  conditions: Array<RuleCondition | RuleConditionGroup>;
}

export type ActionType = 'SHOW' | 'HIDE' | 'REQUIRE' | 'MAKE_OPTIONAL' | 'ENABLE' | 'DISABLE';

export interface RuleAction {
  targetKey: string;
  actionType: ActionType;
}

export interface TemplateRule {
  id: string;
  name?: string;
  conditions: RuleConditionGroup;
  actions: RuleAction[];
  enabled: boolean;
  priority?: number;
}

export type CalculationOperator = 'add' | 'subtract' | 'multiply' | 'divide' | 'percentage' | 'min' | 'max';

export interface CalculationExpressionNode {
  operator?: CalculationOperator;
  field?: string;
  constant?: number;
  left?: CalculationExpressionNode;
  right?: CalculationExpressionNode;
}

export interface CalculationDefinition {
  id: string;
  targetFieldKey: string;
  expression: CalculationExpressionNode;
  enabled: boolean;
}

export interface ComponentEvaluatedState {
  visible: boolean;
  required: boolean;
  enabled: boolean;
}

export interface EvaluatedEngineResult {
  componentStates: Record<string, ComponentEvaluatedState>;
  sectionVisibility: Record<string, boolean>;
  calculatedValues: Record<string, any>;
  errors: string[];
}

// 1. Single Condition Evaluator
export function evaluateSingleCondition(condition: RuleCondition, values: Record<string, any>): boolean {
  const rawVal = values[condition.fieldKey];

  switch (condition.operator) {
    case 'is_empty':
      return rawVal === undefined || rawVal === null || String(rawVal).trim() === '';
    case 'is_not_empty':
      return rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== '';
    case 'is_true':
      return Boolean(rawVal === true || rawVal === 'true' || rawVal === 1);
    case 'is_false':
      return Boolean(rawVal === false || rawVal === 'false' || rawVal === 0 || rawVal === undefined || rawVal === null);
    case 'equals':
      return String(rawVal ?? '').toLowerCase() === String(condition.value ?? '').toLowerCase();
    case 'not_equals':
      return String(rawVal ?? '').toLowerCase() !== String(condition.value ?? '').toLowerCase();
    case 'contains':
      return String(rawVal ?? '').toLowerCase().includes(String(condition.value ?? '').toLowerCase());
    case 'not_contains':
      return !String(rawVal ?? '').toLowerCase().includes(String(condition.value ?? '').toLowerCase());
    case 'greater_than': {
      const numA = Number(rawVal);
      const numB = Number(condition.value);
      return !isNaN(numA) && !isNaN(numB) && numA > numB;
    }
    case 'greater_than_or_equal': {
      const numA = Number(rawVal);
      const numB = Number(condition.value);
      return !isNaN(numA) && !isNaN(numB) && numA >= numB;
    }
    case 'less_than': {
      const numA = Number(rawVal);
      const numB = Number(condition.value);
      return !isNaN(numA) && !isNaN(numB) && numA < numB;
    }
    case 'less_than_or_equal': {
      const numA = Number(rawVal);
      const numB = Number(condition.value);
      return !isNaN(numA) && !isNaN(numB) && numA <= numB;
    }
    default:
      return false;
  }
}

// 2. Condition Group Evaluator
export function evaluateConditionGroup(group: RuleConditionGroup, values: Record<string, any>): boolean {
  if (!group.conditions || group.conditions.length === 0) return true;

  if (group.operator === 'AND') {
    return group.conditions.every((cond) =>
      'operator' in cond && ('fieldKey' in cond)
        ? evaluateSingleCondition(cond as RuleCondition, values)
        : evaluateConditionGroup(cond as RuleConditionGroup, values)
    );
  } else {
    return group.conditions.some((cond) =>
      'operator' in cond && ('fieldKey' in cond)
        ? evaluateSingleCondition(cond as RuleCondition, values)
        : evaluateConditionGroup(cond as RuleConditionGroup, values)
    );
  }
}

// 3. Calculation Node Evaluator
export function evaluateExpressionNode(node: CalculationExpressionNode, values: Record<string, any>): number {
  if (!node) return 0;

  if (node.constant !== undefined && node.constant !== null) {
    return Number(node.constant) || 0;
  }

  if (node.field) {
    const val = values[node.field];
    const num = Number(val);
    return isNaN(num) ? 0 : num;
  }

  if (!node.operator) return 0;

  const leftVal = node.left ? evaluateExpressionNode(node.left, values) : 0;
  const rightVal = node.right ? evaluateExpressionNode(node.right, values) : 0;

  switch (node.operator) {
    case 'add':
      return leftVal + rightVal;
    case 'subtract':
      return leftVal - rightVal;
    case 'multiply':
      return leftVal * rightVal;
    case 'divide':
      return rightVal === 0 ? 0 : leftVal / rightVal;
    case 'percentage':
      return rightVal === 0 ? 0 : (leftVal / rightVal) * 100;
    case 'min':
      return Math.min(leftVal, rightVal);
    case 'max':
      return Math.max(leftVal, rightVal);
    default:
      return 0;
  }
}

// 4. Circular Dependency Checker for Calculations
export function detectCircularCalculations(calculations: CalculationDefinition[]): { hasCycle: boolean; cyclePath?: string[] } {
  const graph = new Map<string, string[]>();

  const getDependencies = (node: any): string[] => {
    if (!node || typeof node !== 'object') return [];
    const deps: string[] = [];
    if (node.field) deps.push(node.field);
    if (node.left) deps.push(...getDependencies(node.left));
    if (node.right) deps.push(...getDependencies(node.right));
    return deps;
  };

  calculations.forEach((calc) => {
    if (calc.enabled) {
      graph.set(calc.targetFieldKey, getDependencies(calc.expression));
    }
  });

  const visited = new Set<string>();
  const recStack = new Set<string>();
  const cyclePath: string[] = [];

  const dfs = (node: string): boolean => {
    visited.add(node);
    recStack.add(node);
    cyclePath.push(node);

    const neighbors = graph.get(node) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) return true;
      } else if (recStack.has(neighbor)) {
        cyclePath.push(neighbor);
        return true;
      }
    }

    recStack.delete(node);
    cyclePath.pop();
    return false;
  };

  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      if (dfs(node)) {
        return { hasCycle: true, cyclePath };
      }
    }
  }

  return { hasCycle: false };
}

// 5. Main Rules & Calculation Orchestration Engine
export function evaluateTemplateRulesAndCalculations(
  template: any,
  currentValues: Record<string, any>
): EvaluatedEngineResult {
  const components: any[] = template.components || template.fields || [];
  const sections: any[] = template.sections || template.dynamicSections?.map((s: any) => s.title) || [];
  const rules: TemplateRule[] = template.rules || (template.rules_json ? JSON.parse(template.rules_json) : []);
  const calculations: CalculationDefinition[] = template.calculations || (template.calculations_json ? JSON.parse(template.calculations_json) : []);

  const componentStates: Record<string, ComponentEvaluatedState> = {};
  const sectionVisibility: Record<string, boolean> = {};

  // Build component key <-> id mapping
  const keyToIds = new Map<string, string[]>();
  components.forEach((c: any) => {
    const key = c.key || c.id;
    const baseState: ComponentEvaluatedState = {
      visible: true,
      required: Boolean(c.required),
      enabled: true,
    };

    componentStates[key] = baseState;
    componentStates[c.id] = baseState;

    if (!keyToIds.has(key)) keyToIds.set(key, []);
    keyToIds.get(key)!.push(c.id);
  });

  // Initialize section visibility
  sections.forEach((secName: string) => {
    const sTitle = typeof secName === 'string' ? secName : (secName as any).title;
    sectionVisibility[sTitle] = true;
  });

  // 1. FIRST: Evaluate Calculations to build complete combined values
  const calculatedValues: Record<string, any> = {};
  const activeCalculations = calculations.filter((c) => c.enabled);
  const errors: string[] = [];

  const cycleCheck = detectCircularCalculations(activeCalculations);
  if (cycleCheck.hasCycle) {
    errors.push(`CIRCULAR_CALCULATION_DEPENDENCY: ${cycleCheck.cyclePath?.join(' -> ')}`);
  } else {
    const combinedValues = { ...currentValues };
    activeCalculations.forEach((calc) => {
      const calcResult = evaluateExpressionNode(calc.expression, combinedValues);
      calculatedValues[calc.targetFieldKey] = calcResult;
      combinedValues[calc.targetFieldKey] = calcResult;
    });
  }

  const allValues = { ...currentValues, ...calculatedValues };

  // 2. SECOND: Evaluate Rules with complete combined values
  const activeRules = rules.filter((r) => r.enabled).sort((a, b) => (a.priority || 0) - (b.priority || 0));

  activeRules.forEach((rule) => {
    const isConditionMet = evaluateConditionGroup(rule.conditions, allValues);

    if (isConditionMet) {
      rule.actions.forEach((action) => {
        const targetKey = action.targetKey;

        // Section target
        if (sectionVisibility[targetKey] !== undefined) {
          if (action.actionType === 'SHOW') sectionVisibility[targetKey] = true;
          if (action.actionType === 'HIDE') sectionVisibility[targetKey] = false;
        }

        // Component targets (update by key and by id)
        const applyToState = (state: ComponentEvaluatedState) => {
          switch (action.actionType) {
            case 'SHOW':
              state.visible = true;
              break;
            case 'HIDE':
              state.visible = false;
              break;
            case 'REQUIRE':
              state.required = true;
              break;
            case 'MAKE_OPTIONAL':
              state.required = false;
              break;
            case 'ENABLE':
              state.enabled = true;
              break;
            case 'DISABLE':
              state.enabled = false;
              break;
          }
        };

        if (componentStates[targetKey]) {
          applyToState(componentStates[targetKey]);
        }

        const ids = keyToIds.get(targetKey) || [];
        ids.forEach((id) => {
          if (componentStates[id]) {
            applyToState(componentStates[id]);
          }
        });
      });
    }
  });

  return {
    componentStates,
    sectionVisibility,
    calculatedValues,
    errors,
  };
}
