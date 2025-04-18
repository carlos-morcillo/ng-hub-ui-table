import { animate, style, transition, trigger } from '@angular/animations';
import { AsyncPipe, NgClass, NgTemplateOutlet } from '@angular/common';
import {
	Component,
	ContentChild,
	ContentChildren,
	EnvironmentInjector,
	EventEmitter,
	Input,
	OnDestroy,
	OnInit,
	Output,
	QueryList,
	ResourceRef,
	TemplateRef,
	ViewChildren,
	forwardRef,
	inject,
	input,
	model,
	resource
} from '@angular/core';
import {
	FormGroup,
	FormsModule,
	NG_VALUE_ACCESSOR,
	ReactiveFormsModule,
	UntypedFormBuilder,
	UntypedFormControl
} from '@angular/forms';
import { get } from 'lodash';
import {
	Observable,
	Subject,
	Subscription,
	isObservable,
	merge,
	of
} from 'rxjs';
import { debounceTime, tap } from 'rxjs/operators';
import { BREAKPOINTS } from '../../constants/breakpoints';
import { PaginableTableCellDirective } from '../../directives/paginable-table-cell.directive';
import { PaginableTableErrorDirective } from '../../directives/paginable-table-error.directive';
import { PaginableTableExpandingRowDirective } from '../../directives/paginable-table-expanding-row.directive';
import { PaginableTableFilterDirective } from '../../directives/paginable-table-filter.directive';
import { PaginableTableHeaderDirective } from '../../directives/paginable-table-header.directive';
import { PaginableTableLoadingDirective } from '../../directives/paginable-table-loading.directive';
import { PaginableTableNotFoundDirective } from '../../directives/paginable-table-not-found.directive';
import { PaginableTableRowDirective } from '../../directives/paginable-table-row.directive';
import { FilterChangeEvent } from '../../interfaces/filter-change-event';
import { ItemClickEvent } from '../../interfaces/item-click-event';
import { PaginableTableButton } from '../../interfaces/paginable-table-button';
import { PaginableTableDropdown } from '../../interfaces/paginable-table-dropdown';
import { PaginableTableHeader } from '../../interfaces/paginable-table-header';
import { PaginableTableItem } from '../../interfaces/paginable-table-item';
import { PaginableTableOptions } from '../../interfaces/paginable-table-options';
import { PaginableTableOrdination } from '../../interfaces/paginable-table-ordination';
import { PaginationParamsChangeEvent } from '../../interfaces/params-change-event';
import { IsObservablePipe } from '../../pipes/is-observable.pipe';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { UcfirstPipe } from '../../pipes/ucfirst.pipe';
import { UnwrapAsyncPipe } from '../../pipes/unwrap-async.pipe';
import { PaginableService } from '../../services/paginable.service';
import { PaginationService } from '../../services/pagination.service';
import { generateUniqueId } from '../../utils';
import { DropdownComponent } from '../dropdown/dropdown.component';
import { HubIconComponent } from '../icon/icon.component';
import { MenuFilterComponent } from '../menu-filter/menu-filter.component';
import { PaginableTableDropdownComponent } from '../paginable-table-dropdown/paginable-table-dropdown.component';
import { PaginableTableRangeInputComponent } from '../paginable-table-range-input/paginable-table-range-input.component';
import { PaginatorComponent } from '../paginator/paginator.component';

@Component({
	selector: 'hub-table, hub-ui-table',
	standalone: true,
	templateUrl: './paginable-table.component.html',
	styleUrls: ['./paginable-table.component.scss'],
	imports: [
		NgClass,
		NgTemplateOutlet,
		AsyncPipe,
		ReactiveFormsModule,
		FormsModule,
		TranslatePipe,
		UcfirstPipe,
		UnwrapAsyncPipe,
		IsObservablePipe,
		PaginableTableDropdownComponent,
		DropdownComponent,
		MenuFilterComponent,
		HubIconComponent,
		PaginatorComponent,
		PaginableTableRangeInputComponent
	],
	animations: [
		trigger('fadeInOut', [
			transition(':enter', [
				style({ opacity: 0 }),
				animate('256ms 256ms', style({ opacity: 1, height: 'auto' }))
			]),
			transition(':leave', [
				animate('256ms ease-out', style({ opacity: 0, height: '0' }))
			])
		])
	],
	providers: [
		{
			provide: NG_VALUE_ACCESSOR,
			useExisting: forwardRef(() => PaginableTableComponent),
			multi: true
		}
	],
	host: {
		class: 'd-block paginable-table'
	}
})
export class PaginableTableComponent<T = any> implements OnInit, OnDestroy {
	#injector = inject(EnvironmentInjector);
	#fb = inject(UntypedFormBuilder);
	#configSvc = inject(PaginableService);
	#paginationSvc = inject(PaginationService);

	@Input() id!: string;

	@Input() showSearchInput: boolean = true;
	@Input() options: PaginableTableOptions = {
		cursor: 'default',
		hoverableRows: false,
		striped: null,
		variant: null
	};

	loading: boolean = false;
	errorOcurred: boolean = false;

	/**
	 * Table headers
	 *
	 * @readonly
	 * @type {(PaginableTableHeader[])}
	 * @memberof PaginableTableComponent
	 */
	private _headers?: PaginableTableHeader[];
	get headers(): Array<PaginableTableHeader> {
		return this._headers ?? [];
	}
	@Input()
	set headers(value: Array<PaginableTableHeader | string>) {
		this._headers = value.map((header) => {
			if (typeof header === 'string') {
				return {
					title: header,
					property: header
				};
			}
			return header;
		});

		// Parsing headers
		for (const header of this._headers) {
			if (
				header.constructor.name === 'Object' &&
				(header as PaginableTableHeader).buttons &&
				!(header as PaginableTableHeader).property
			) {
				Object.assign(
					header,
					{ wrapping: 'nowrap', onlyButtons: true, align: 'end' },
					header
				);
			}
		}

		this._initializeFilterForm();

		// We need to wait for all other inputs to be ready before initializing the column count
		setTimeout(() => this._countColumns());
	}

	/**
	 * The number of columns in the table.
	 *
	 * @type {number}
	 * @memberof PaginableTableComponent
	 */
	columnsCount: number = 0;

	get lastColumnOnlyHasButtons() {
		if (!this._headers) {
			return null;
		}
		const lastHeader = this._headers[this._headers.length - 1];
		return (
			lastHeader.constructor.name === 'Object' &&
			(lastHeader as PaginableTableHeader).buttons &&
			!(lastHeader as PaginableTableHeader).property
		);
	}

	// /**
	//  * Items paginated
	//  *
	//  * @private
	//  * @type {PaginableTablePagination}
	//  * @memberof PaginableTableComponent
	//  */
	// private _pagination: PaginableTablePagination | null = null;
	// @Input()
	// get pagination():
	// 	| PaginableTablePagination
	// 	| Observable<PaginableTablePagination>
	// 	| null {
	// 	return this._pagination;
	// }
	// set pagination(
	// 	v: PaginableTablePagination | Observable<PaginableTablePagination>
	// ) {
	// 	if (!v) {
	// 		this.data = null;
	// 	} else if (isObservable(v)) {
	// 		(v as Observable<PaginableTablePagination>)
	// 			.pipe(
	// 				map((value: PaginableTablePagination) => ({
	// 					loading: false,
	// 					error: false,
	// 					value: value
	// 				})),
	// 				startWith({ loading: true, error: false, value: null }),
	// 				catchError((error) =>
	// 					of({ loading: false, error, value: null })
	// 				),
	// 				map((o) => {
	// 					this.loading = !!o.loading;
	// 					this.errorOcurred = o.error;
	// 					return o.value;
	// 				})
	// 			)
	// 			.subscribe((result: PaginableTablePagination | null) => {
	// 				this.data = result;
	// 				this.markSelected();
	// 			});
	// 	} else {
	// 		this.data = v as PaginableTablePagination;
	// 	}
	// 	this.allRowsSelected = false;
	// 	if (this.selectable || this.batchActions?.length) {
	// 		this.markSelected();
	// 	}
	// }

	// /**
	//  * Items not paginated
	//  *
	//  * @private
	//  * @type {any[]}
	//  * @memberof PaginableTableComponent
	//  */
	// private _rows: any[] | null = null;
	// @Input()
	// get rows(): any[] | null {
	// 	return this._rows;
	// }
	// set rows(v: any[]) {
	// 	this._rows = v;
	// 	const params = {
	// 		page: 1,
	// 		ordination: this.ordination(),
	// 		searchText: this.searchText(),
	// 		searchKeys: this.searchKeys,
	// 		paginate: this.paginate
	// 	};
	// 	this.data = this.rows
	// 	#paginationSvc.generate(this.rows, params)
	// 		: null;
	// 	this.allRowsSelected = false;
	// 	this.markSelected();
	// }

	/**
	 * Collection of selected rows
	 *
	 * @type {Array<T>}
	 * @memberof PaginableTableComponent
	 */
	selectedItems: Array<T> = [];

	/**
	 * Set whether all page rows are selecteds
	 *
	 * @type {boolean}
	 * @memberof PaginableTableComponent
	 */
	allRowsSelected: boolean = false;

	/**
	 * If set, it will be the property returned in the onSelected event
	 *
	 * @type {string}
	 * @memberof PaginableTableComponent
	 */
	@Input() selectableProperty?: string;

	/**
	 * Event triggered when a row or multiples rows are selected or unselected
	 *
	 * @memberof PaginableTableComponent
	 */
	@Output() onSelected = new EventEmitter<any>();

	/**
	 * Pagination position
	 *
	 * @type {('bottom' | 'top' | 'both')}
	 * @memberof PaginableTableComponent
	 */
	@Input() paginationPosition: 'bottom' | 'top' | 'both' = 'bottom';

	@Input() paginationInfo: boolean = true;

	@Input() searchKeys: string[] = ['name'];

	/**
	 * Collection of actions for items
	 *
	 * @type {PaginableTableRowAction[]}
	 * @memberof PaginableTableComponent
	 */
	private _batchActions: Array<
		PaginableTableDropdown | PaginableTableButton
	> = [];
	@Input()
	get batchActions(): Array<PaginableTableDropdown | PaginableTableButton> {
		return this._batchActions;
	}
	set batchActions(v: Array<PaginableTableDropdown | PaginableTableButton>) {
		this._batchActions = v.map((b) => {
			if ((b as PaginableTableDropdown).buttons) {
				b = { fill: null, position: 'start', color: 'light', ...b };
			}
			return b;
		});
		this._countColumns();
	}

	batchActionsDropdown?: PaginableTableDropdown;

	batchAction?: PaginableTableButton | null = null;

	// readonly data = input.required<ResourceRef<Array<T>>>();

	private _data: ResourceRef<Array<T>>;
	get data(): ResourceRef<Array<T>> {
		return this._data;
	}
	@Input()
	set data(v: ResourceRef<Array<T>> | Array<T>) {
		this._data = Array.isArray(v)
			? resource({
					loader: async () => Promise.resolve(v),
					injector: this.#injector
				})
			: v;
	}

	readonly ordination = model<PaginableTableOrdination>();

	readonly searchText = model<string>();

	readonly page = model<number>();

	readonly perPage = model<number>();

	readonly stickyActions = input<boolean>(false);

	/**
	 * Set whether the rows are selectable
	 *
	 * @type {boolean}
	 * @memberof PaginableTableComponent
	 */
	readonly selectable = input<boolean>(false);

	/**
	 * Set whether the selectable can be multiple
	 *
	 * @type {boolean}
	 * @memberof PaginableTableComponent
	 */
	readonly multiple = input<boolean>(false);

	/**
	 * On item click event emitter
	 *
	 * @memberof PaginableTableComponent
	 */
	@Input() clickFn: (event: ItemClickEvent<T>) => void | Promise<void>;

	/**
	 * On page click event emitter
	 *
	 * @memberof PaginableTableComponent
	 */
	@Output() onPageClick = new EventEmitter<number>();

	/**
	 * On params change event emitter
	 *
	 * @memberof PaginableTableComponent
	 */
	@Output() onParamsChange = new EventEmitter<PaginationParamsChangeEvent>();
	@Output() filterChange = new EventEmitter<FilterChangeEvent>();

	// TODO: Put default config
	mapping: any = this.#configSvc.mapping;

	// /**
	//  * Rows per page options
	//  *
	//  * @private
	//  * @type {number[]}
	//  * @memberof PaginableTableComponent
	//  */
	// private _perPageOptions: number[] = [10, 20, 50, 100];
	// @Input()
	// get perPageOptions(): number[] {
	// 	return this._perPageOptions;
	// }
	// set perPageOptions(v: number[]) {
	// 	this._perPageOptions = v;
	// 	this.itemsPerPage = this._perPageOptions.length
	// 		? this._perPageOptions[0]
	// 		: 20;
	// }

	responsiveCSSClass: string | null = '';
	private _responsive?: string;
	@Input()
	get responsive(): string | null {
		return this._responsive ?? null;
	}
	set responsive(v: string) {
		this._responsive = v;
		if (this._responsive && BREAKPOINTS.indexOf(this._responsive) > -1) {
			this.responsiveCSSClass =
				this.responsive === 'xs'
					? null
					: 'table-responsive-' + this.responsive;
		} else {
			this.responsiveCSSClass = '';
		}
	}

	filterHeaders?: PaginableTableHeader[];

	hasColumnFilters: boolean = false;

	/**
	 * Filter form
	 *
	 * @type {FormGroup}
	 * @memberof PaginableTableComponent
	 */
	filterFG: FormGroup = new FormGroup({});

	filterFGSct?: Subscription;

	filterLoading: boolean = false;

	filterTrigger$: Subject<void> = new Subject();

	/**
	 * Time to ouput the filter form value
	 *
	 * @type {number}
	 * @memberof PaginableTableComponent
	 */
	@Input() debounce: number = 1024;

	disabled: boolean = false;

	/**
	 * Set if the data must be paginated
	 *
	 * @type {boolean}
	 * @memberof PaginableTableComponent
	 */
	@Input() paginate: boolean = true;

	@ContentChildren(PaginatorComponent)
	paginators?: QueryList<DropdownComponent>;
	@ContentChild(PaginableTableRowDirective, { read: TemplateRef })
	templateRow?: TemplateRef<any>;
	@ContentChildren(PaginableTableHeaderDirective)
	headerTpts!: QueryList<PaginableTableHeaderDirective>;
	@ContentChildren(PaginableTableCellDirective)
	templateCells!: QueryList<PaginableTableCellDirective>;
	@ContentChild(PaginableTableNotFoundDirective, { read: TemplateRef })
	noDataTpt?: TemplateRef<any>;
	@ContentChild(PaginableTableLoadingDirective, { read: TemplateRef })
	loadingTpt?: TemplateRef<any>;
	@ContentChild(PaginableTableErrorDirective, { read: TemplateRef })
	errorTpt?: TemplateRef<any>;
	@ContentChildren(PaginableTableExpandingRowDirective)
	templateExpandingRows!: QueryList<PaginableTableExpandingRowDirective>;
	@ContentChildren(PaginableTableFilterDirective)
	filterTpts!: QueryList<PaginableTableFilterDirective>;

	@ViewChildren(DropdownComponent)
	dropdownComponents?: QueryList<DropdownComponent>;

	/**
	 * Set if the view selector must be showed
	 *
	 * @type {boolean}
	 * @memberof PaginableTableComponent
	 */
	@Input() showViewSelector: boolean = false;

	@Input() viewSaverForm: any;

	get specificSearchFG(): FormGroup {
		return this.filterFG.get('specificSearch') as FormGroup;
	}

	ngOnInit() {
		if (!this.id) {
			this.id = generateUniqueId(16);
		}
	}

	ngOnDestroy(): void {
		this.filterFGSct?.unsubscribe();
	}

	writeValue(value: any): void {
		if (value) {
			this.selectedItems = Array.isArray(value) ? value : [value];
		} else {
			this.selectedItems = [];
		}
		this.markSelected();
	}

	onChange = (_: any) => {};
	onTouch = () => {};

	registerOnChange(fn: any): void {
		this.onChange = fn;
	}

	registerOnTouched(fn: any): void {
		this.onTouch = fn;
	}

	setDisabledState(isDisabled: boolean): void {
		this.disabled = isDisabled;
	}

	/**
	 * Obtiene la propiedad del objeto cuya clave es pasada por parámetro
	 *
	 * @param {object} item
	 * @param {string} key
	 * @returns {*}
	 * @memberof PaginableTableComponent
	 */
	getProperty(item: object, key: string): any {
		return get(item, key);
	}

	/**
	 * Handles click events by extracting specific properties and passing them to a callback function.
	 *
	 * @param  - The `onItemClick` function takes in the following parameters: collapsed, selected and item.
	 * @param {number} depth - The `depth` parameter in the `onItemClick` function represents the depth level of the item being
	 * clicked. It is a number that indicates how deep the item is nested within a hierarchical structure.
	 * @param {number} index - The `index` parameter in the `onItemClick` function represents the position of the item that was clicked
	 * within a list or array. It is a number that indicates the index of the clicked item.
	 *
	 * @returns If the `clickFn` property is not defined in the current context, the `onItemClick` function will return without
	 * executing any further code.
	 */
	onItemClick(
		{ collapsed, selected, ...item },
		depth: number,
		index: number
	) {
		if (!this.clickFn) {
			return;
		}

		this.clickFn({
			depth,
			index,
			selected,
			collapsed,
			value: item as T,
			item: item as T
		});
	}

	filter() {
		debugger;
		// if (!this.data) {
		// 	return;
		// }
		// this.data.currentPage = 1;
		// this.filterChange.emit({
		// 	searchText: this.searchText(),
		// 	specificSearch: this.specificSearchFG?.value ?? null
		// });
	}

	pageClicked(page: number) {
		this.page.set(page);
	}

	/**
	 * If paging is done on the server, a parameter change subscription is launched. Otherwise,
	 * get the data sorted according to the header passed by parameter.
	 *
	 * @param {PaginableTableHeader} header
	 * @returns {void}
	 * @memberof PaginableTableComponent
	 */
	sort(header: PaginableTableHeader): void {
		if (!header.sortable) {
			return;
		}
		if (
			!this.ordination() ||
			this.ordination()?.property !== header.property
		) {
			this.ordination.set({
				property: header.property as any,
				direction: 'ASC'
			});
		} else {
			this.ordination.set({
				property: header.property,
				direction:
					this.ordination()?.direction === 'ASC' ? 'DESC' : 'ASC'
			});
		}
		// 	this.triggerTheParamChanges();
	}

	// triggerTheParamChanges() {
	// 	if (!this.data) {
	// 		return;
	// 	}
	// 	const params: PaginationParamsChangeEvent = {
	// 		page: this.data.currentPage,
	// 		perPage: this.itemsPerPage,
	// 		ordination: this.ordination(),
	// 		searchText: this.searchText(),
	// 		searchKeys: this.searchKeys,
	// 		paginate: this.paginate
	// 	};

	// 	Object.keys(params).forEach(
	// 		(k) => params[k] == null && delete params[k]
	// 	);

	// 	if (!this.rows) {
	// 		this.onParamsChange.next(params);
	// 	} else {
	// 		this.data#paginationSvc.generate(this.rows, params);
	// 	}
	// }

	/**
	 * Get the ordination class
	 *
	 * @param {PaginableTableHeader} header
	 * @returns
	 * @memberof PaginableTableComponent
	 */
	getOrdenationClass(header: PaginableTableHeader) {
		if (
			!this.ordination ||
			this.ordination()?.property !== header.property
		) {
			return 'fa-sort';
		}
		return this.ordination()?.direction.toUpperCase() === 'ASC'
			? 'fa-sort-up'
			: 'fa-sort-down';
	}

	/**
	 * If it exists, returns the header cell template for the header passed by parameter
	 *
	 * @param {(PaginableTableHeader)} header
	 * @returns {TemplateRef<PaginableTableCellDirective>}
	 * @memberof PaginableTableComponent
	 */
	getHeaderTemplate(header: PaginableTableHeader): TemplateRef<any> | null {
		const property = header instanceof String ? header : header.property;
		if (!property) {
			return null;
		}
		const directive = this.headerTpts.find((o) => {
			return o.header === property;
		});
		return directive ? directive.template : null;
	}

	/**
	 * If it exists, returns the cell template for the header passed by parameter
	 *
	 * @param {(PaginableTableHeader)} header
	 * @returns {TemplateRef<PaginableTableCellDirective>}
	 * @memberof PaginableTableComponent
	 */
	getCellTemplate(header: PaginableTableHeader): TemplateRef<any> | null {
		const property = header instanceof String ? header : header.property;
		if (!property) {
			return null;
		}
		const directive = this.templateCells.find((o) => {
			return o.header === property;
		});
		return directive ? directive['template'] : null;
	}

	/**
	 * If it exists, returns the filter template for the header passed by parameter
	 *
	 * @param {(PaginableTableHeader)} header
	 * @returns {TemplateRef<PaginableTableCellDirective>}
	 * @memberof PaginableTableComponent
	 */
	getFilterTemplate(
		header: PaginableTableHeader
	): TemplateRef<PaginableTableFilterDirective> | null {
		const property = header instanceof String ? header : header.property;
		if (!property) {
			return null;
		}
		const directive = this.filterTpts.find((o) => o.header === property);
		return directive ? directive.template : null;
	}

	/**
	 * Handles the action to execute
	 *
	 * @param {Function} handler
	 * @param {*} item
	 * @memberof PaginableTableComponent
	 */
	handleAction(event: Event, handler: (...args: any) => void, item: any) {
		event.stopPropagation();
		handler(item);
	}

	/**
	 * Handles the action to be executed in a batch
	 *
	 * @param {Event} event
	 * @memberof PaginableTableComponent
	 */
	handleBatchAction(event: any) {
		event.handler(this.selectedItems);
	}

	/**
	 * Determines whether to display the batch actions menu
	 *
	 * @type {boolean}
	 * @memberof PaginableTableComponent
	 */
	batchActionsShown: boolean = false;

	isHidden(button: PaginableTableButton, item: any): Observable<boolean> {
		if (typeof button.hidden === 'function') {
			const result = button.hidden(item);
			return isObservable(result)
				? (result as Observable<boolean>)
				: of(result);
		}
		return of(!!button.hidden);
	}

	/**
	 * Expand or unexpand an expanding row
	 *
	 * @param {PaginableTableItem} item
	 * @memberof PaginableTableComponent
	 */
	toggleExpandedRow(item: PaginableTableItem) {
		item.unfold = !item.unfold;
	}

	/**
	 * Select or unselect all page items
	 *
	 * @memberof PaginableTableComponent
	 */
	toggleAll() {
		this.allRowsSelected = !this.allRowsSelected;
		if (!this.data) {
			return;
		}
		this.data[this.mapping.data].forEach((o) => {
			const needle = this.selectableProperty
				? o[this.selectableProperty]
				: o;
			const index = this.selectedItems.indexOf(needle);
			if (index > -1 && !this.allRowsSelected) {
				this.selectedItems.splice(index, 1);
			} else if (index === -1 && this.allRowsSelected) {
				this.selectedItems.push(needle);
			}
			o.selected = this.allRowsSelected;
		});
		this.onSelected.emit(this.selectedItems);
		this.emitValue();
	}

	/**
	 * Select or unselect a row
	 *
	 * @param {*} item
	 * @memberof PaginableTableComponent
	 */
	toggle(item: any) {
		if (!this.data) {
			return;
		}
		const needle = this.selectableProperty
			? item[this.selectableProperty]
			: item;
		const index = this.selectedItems.indexOf(needle);
		if (index > -1) {
			this.selectedItems.splice(index, 1);
			item.selected = false;
		} else {
			this.selectedItems.push(needle);
			item.selected = true;
		}

		if (!this.multiple()) {
			this.selectedItems = item.selected ? [needle] : [];
			this.data[this.mapping.data].forEach((o) => {
				const needle = this.selectableProperty
					? o[this.selectableProperty]
					: o;
				o.selected = this.selectedItems.indexOf(needle) > -1;
			});
		} else {
			this.allRowsSelected = this.data[this.mapping.data].every(
				(o) => o.selected
			);
		}

		this.onSelected.emit(this.selectedItems);
		this.emitValue();
	}

	/**
	 * Select or deselect a row if it exists in the collection of selected items
	 *
	 * @memberof PaginableTableComponent
	 */
	markSelected() {
		if (!this.data?.[this.mapping.data]?.length) {
			return;
		}
		this.data[this.mapping.data].forEach((o) => {
			const needle = this.selectableProperty
				? o[this.selectableProperty]
				: o;
			o.selected = this._contains(this.selectedItems, needle);
		});
		this.allRowsSelected = this.data[this.mapping.data].every(
			(o) => o.selected
		);
	}

	/**
	 * Check if a needle exists in a list
	 *
	 * @private
	 * @param {any[]} list
	 * @param {*} needle
	 * @return {*}  {boolean}
	 * @memberof PaginableTableComponent
	 */
	private _contains(list: any[], needle: any): boolean {
		if (typeof needle === 'object' && needle !== null) {
			list = list.map((o) => {
				const { selected, ...clone } = o;
				return clone;
			});

			const { selected, ...p } = needle;
			return list.some((o) => JSON.stringify(o) === JSON.stringify(p));
		}
		return list.indexOf(needle) > -1;
	}

	/**
	 * Initializes the filtering form and its subscription
	 *
	 * @memberof PaginableTableComponent
	 */
	_initializeFilterForm(): void {
		this.filterFGSct?.unsubscribe();

		this.filterFG = this.#fb.group({
			searchText: []
		});

		if (this.headers?.length) {
			const filtersFG = this.#fb.group({});

			this.filterHeaders = (
				this._headers as Array<PaginableTableHeader>
			).filter((header) => typeof header === 'object' && header.filter);
			this.filterHeaders.forEach((h) => {
				filtersFG.addControl(
					(h.filter?.key || h.property) as string,
					new UntypedFormControl(null)
				);
			});

			this.hasColumnFilters = this.filterHeaders.some(
				(filter) => filter.filter && filter.filter?.mode !== 'menu'
			);

			if (this.id) {
				const view = JSON.parse(
					localStorage.getItem('paginable-table_view_' + this.id) ??
						'{}'
				);
				filtersFG.patchValue(view);
			}

			this.filterFG.addControl('specificSearch', filtersFG);
		}

		this.filterFGSct = merge(
			this.filterTrigger$.pipe(tap(() => (this.filterLoading = true))),
			this.filterFG.valueChanges.pipe(
				tap(() => {
					this.filterLoading = true;
				}),
				debounceTime(this.debounce)
			)
		)
			.pipe(
				debounceTime(this.debounce),
				tap((_) => {
					this.filterChange.emit(this.filterFG.value);
					this.filterLoading = false;
				})
			)
			.subscribe();
	}

	/**
	 * Calculates the number of columns in the table, based on its headers and other optional elements.
	 *
	 * @private
	 * @memberof PaginableTableComponent
	 */
	private _countColumns() {
		let count = this.headers.length;
		if (
			(this.selectable() && this.multiple()) ||
			this.batchActions?.length
		) {
			count++;
		}
		if (
			this.templateExpandingRows?.length &&
			!this.lastColumnOnlyHasButtons
		) {
			count++;
		}
		this.columnsCount = count;
	}

	/**
	 * Clean the advanced filter form
	 *
	 * @memberof PaginableTableComponent
	 */
	clearAdvancedFilters(): void {
		this.filterFG.reset();
	}

	/**
	 * Emite el valor de los items seleccionados
	 *
	 */
	emitValue() {
		this.onChange(
			this.multiple() ? this.selectedItems : this.selectedItems[0]
		);
	}

	/**
	 * Closes all other dropdowns except the one with the specified id.
	 *
	 * @param {id} - The `onDropdownFilterOpened` function takes an object parameter `id`.
	 */
	onDropdownFilterOpened({ id }) {
		this.dropdownComponents?.forEach((dropdown) => {
			if (dropdown.id !== id && dropdown.isOpened) {
				dropdown.closeDropdown();
			}
		});
	}
}
