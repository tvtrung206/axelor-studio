/*
 * Axelor Business Solutions
 *
 * Copyright (C) 2022 Axelor (<http://axelor.com>).
 *
 * This program is free software: you can redistribute it and/or  modify
 * it under the terms of the GNU Affero General Public License, version 3,
 * as published by the Free Software Foundation.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
package com.axelor.studio.web;

import com.axelor.inject.Beans;
import com.axelor.rpc.ActionRequest;
import com.axelor.rpc.ActionResponse;
import com.axelor.studio.db.AppLoader;
import com.axelor.studio.db.repo.AppLoaderRepository;
import com.axelor.studio.service.loader.AppLoaderExportService;
import com.axelor.studio.service.loader.AppLoaderImportService;
import com.axelor.utils.helpers.ExceptionHelper;

public class AppLoaderController {

  public void exportApps(ActionRequest request, ActionResponse response) {
    try {
      AppLoader appLoader = request.getContext().asType(AppLoader.class);
      appLoader = Beans.get(AppLoaderRepository.class).find(appLoader.getId());
      Beans.get(AppLoaderExportService.class).exportApps(appLoader);
      response.setReload(true);
    } catch (Exception e) {
      ExceptionHelper.trace(response, e);
    }
  }

  public void importApps(ActionRequest request, ActionResponse response) {
    try {
      AppLoader appLoader = request.getContext().asType(AppLoader.class);
      appLoader = Beans.get(AppLoaderRepository.class).find(appLoader.getId());
      Beans.get(AppLoaderImportService.class).importApps(appLoader);
      response.setReload(true);
    } catch (Exception e) {
      ExceptionHelper.trace(response, e);
    }
  }
}
