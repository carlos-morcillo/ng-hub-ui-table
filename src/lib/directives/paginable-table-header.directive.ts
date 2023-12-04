import { Directive, Input, TemplateRef } from '@angular/core';

@Directive({
	selector: '[paginableTableHeader]'
})
export class PaginableTableHeaderDirective {
	@Input() header!: string;
	constructor(public template: TemplateRef<any>) {}
}
